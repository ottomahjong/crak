import type {
  Board,
  CombineEvent,
  Direction,
  GameSnapshot,
  GameState,
  LearningStage,
  RackHand,
  Suit,
  Tile,
  TargetPattern,
  TileTypeId,
} from "@/types";
import { CELL_COUNT } from "@/types";
import { applyMove, entryLinesFor, hasAnyMove } from "@/game/rules/movement";
import { reconcileTargets } from "@/game/rules/targets";
import { scoreForEvents, handCompletionScore, SCORING } from "@/game/scoring";
import {
  drawFromWall,
  pickEmptyCell,
  REINFORCE_P,
  REINFORCE_P_MAX,
  REINFORCE_P_CONGESTION,
} from "@/game/generator";
import {
  buildWall,
  wallSize,
  PRIMARY_WALL,
  LEARNING_WALL,
  type TileInventoryConfig,
} from "@/game/inventory";
import { randomSeed } from "@/lib/rng";
import {
  instantiatePattern,
  instantiateLearningPattern,
  pickPatternForRound,
  OPENING_PATTERN_ID,
} from "@/data/targets";
import { makeLooseFromType } from "@/game/tiles";
import { CONFIG } from "@/game/config";
import { learningPool, ruleOptsFor, advancedUnlocked } from "@/game/rules/options";
import { evaluateHandSolvability, steerTypeForTarget } from "@/game/solvability";

// Re-exported so existing imports (tests, UI) keep working from one place.
export { learningPool, ruleOptsFor, advancedUnlocked };

/** Minimum tiles the board must hold after a hand cashes in, to stay playable. */
const MIN_TILES_AFTER_HAND = 4;

/** Below this solvability confidence, a spawn is steered toward a needed tile. */
const STEER_CONFIDENCE = 0.5;

/** With the wall empty, this many no-progress swipes ends the game (stalemate).
 *  Generous enough never to cut short real maneuvering on a 4×4 board. */
const STALEMATE_IDLE = 24;

/** The finite wall configuration this state draws from. */
export function wallConfigFor(learning?: LearningStage): TileInventoryConfig {
  return learning ? LEARNING_WALL : PRIMARY_WALL;
}

/** Remove one copy of `type` from a wall array (returns a new array). */
function removeFromWall(wall: TileTypeId[], type: TileTypeId): TileTypeId[] {
  const i = wall.indexOf(type);
  if (i === -1) return wall;
  const next = wall.slice();
  next.splice(i, 1);
  return next;
}

// ---------------------------------------------------------------------------
// Snapshot helpers (used for undo)
// ---------------------------------------------------------------------------

export function snapshot(state: GameState): GameSnapshot {
  return {
    board: state.board.map((t) => (t ? { ...t } : null)),
    score: state.score,
    round: state.round,
    multiplier: state.multiplier,
    target: cloneTarget(state.target),
    status: state.status,
    wall: [...state.wall],
    rngState: state.rngState,
    recentSpawns: [...state.recentSpawns],
    idleSwipes: state.idleSwipes,
    elapsedMs: state.elapsedMs,
    handsCompleted: state.handsCompleted,
    setsCreated: state.setsCreated,
    suitCounts: { ...state.suitCounts },
    learning: state.learning,
  };
}

function cloneTarget(target: TargetPattern): TargetPattern {
  return { ...target, requirements: target.requirements.map((r) => ({ ...r })) };
}

export function restoreSnapshot(state: GameState, snap: GameSnapshot): GameState {
  return {
    ...state,
    board: snap.board.map((t) => (t ? { ...t } : null)),
    score: snap.score,
    round: snap.round,
    multiplier: snap.multiplier,
    target: cloneTarget(snap.target),
    status: snap.status,
    wall: [...snap.wall],
    rngState: snap.rngState,
    recentSpawns: [...snap.recentSpawns],
    idleSwipes: snap.idleSwipes,
    elapsedMs: snap.elapsedMs,
    handsCompleted: snap.handsCompleted,
    setsCreated: snap.setsCreated,
    suitCounts: { ...snap.suitCounts },
    learning: snap.learning,
    // Undo bookkeeping is managed by the caller (undo()).
  };
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function emptyCells(board: Board): number[] {
  const cells: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (!board[i]) cells.push(i);
  return cells;
}

type SpawnOutcome = {
  board: Board;
  wall: GameState["wall"];
  rngState: number;
  recentSpawns: GameState["recentSpawns"];
  spawnedCell: number | null;
  spawnedTile: Tile | null;
};

/**
 * Choose the spawn cell. With a swipe direction, the tile enters from the edge
 * OPPOSITE the swipe (swipe left → right edge): the first entry line (edge,
 * then walking inward) that has an empty cell is used, picked deterministically
 * via the RNG. Without a direction (initial deal, round top-up), any empty
 * cell is used.
 */
function pickSpawnCell(
  board: Board,
  direction: Direction | undefined,
  rngState: number,
): { cell: number; rngState: number } {
  if (direction) {
    for (const line of entryLinesFor(direction)) {
      const empty = line.filter((c) => !board[c]);
      if (empty.length > 0) return pickEmptyCell(empty, rngState);
    }
  }
  return pickEmptyCell(emptyCells(board), rngState);
}

function spawnOne(
  board: Board,
  target: TargetPattern,
  wall: GameState["wall"],
  rngState: number,
  recentSpawns: GameState["recentSpawns"],
  cfg: TileInventoryConfig,
  direction?: Direction,
  allowed?: ReadonlySet<TileTypeId>,
  forcedType?: TileTypeId | null,
): SpawnOutcome {
  const empties = emptyCells(board);
  const none: SpawnOutcome = {
    board,
    wall,
    rngState,
    recentSpawns,
    spawnedCell: null,
    spawnedTile: null,
  };
  if (empties.length === 0) return none; // board full — nothing to place onto

  // Reinforcement rises with board fullness: a congested board urgently needs
  // combinable tiles (every swipe spawns), so a near-full board reinforces
  // almost every time — but only ever with tiles the wall still holds.
  const fullness = 1 - empties.length / CELL_COUNT;
  const reinforceP = Math.min(REINFORCE_P_MAX, REINFORCE_P + fullness * REINFORCE_P_CONGESTION);

  const draw = drawFromWall({
    wall,
    rngState,
    recentSpawns,
    board,
    target,
    cfg,
    allowed,
    reinforceP,
    forcedType,
  });
  if (!draw) return none; // the wall is spent — no tile can spawn

  const placed = pickSpawnCell(board, direction, draw.rngState);
  const tile = makeLooseFromType(draw.type);
  const nextBoard = board.slice();
  nextBoard[placed.cell] = tile;
  return {
    board: nextBoard,
    wall: draw.wall,
    rngState: placed.rngState,
    recentSpawns: draw.recentSpawns,
    spawnedCell: placed.cell,
    spawnedTile: tile,
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialState(
  seed = randomSeed(),
  learning?: LearningStage,
): GameState {
  const target = learning
    ? instantiateLearningPattern(learning)
    : instantiatePattern(OPENING_PATTERN_ID);
  let board: Board = new Array(CELL_COUNT).fill(null);
  let rngState = seed >>> 0 || 1;
  let recentSpawns: GameState["recentSpawns"] = [];
  const allowed = learningPool(learning);
  const cfg = wallConfigFor(learning);

  // Build the finite wall — every tile the game will ever deal.
  const built = buildWall(cfg, rngState, allowed);
  let wall = built.wall;
  rngState = built.rngState;
  const wallStart = wall.length;

  if (learning === 1) {
    // Fixed opening for the very first hand, tuned for ONE-STEP movement: the
    // two 1 Dots are two cells apart in a row, so the player learns "one swipe =
    // one space" (bring them adjacent) then "swipe again to combine" — the
    // first pair in ~2 swipes. Two 2 Dots seed the pung. These come OUT of the
    // wall so inventory stays honest.
    const opening: Array<[number, TileTypeId]> = [
      [4, "dot-1"],
      [6, "dot-1"],
      [9, "dot-2"],
      [11, "dot-2"],
    ];
    for (const [cell, type] of opening) {
      board[cell] = makeLooseFromType(type);
      wall = removeFromWall(wall, type);
    }
  } else {
    const count = learning ? CONFIG.INITIAL_TILES_BEGINNER : CONFIG.INITIAL_TILES;
    for (let i = 0; i < count; i++) {
      const out = spawnOne(board, target, wall, rngState, recentSpawns, cfg, undefined, allowed);
      if (!out.spawnedTile) break; // wall exhausted (shouldn't happen at deal time)
      board = out.board;
      wall = out.wall;
      rngState = out.rngState;
      recentSpawns = out.recentSpawns;
    }
  }

  return {
    board,
    score: 0,
    round: 1,
    multiplier: 1,
    target,
    status: "playing",
    learning,
    wall,
    wallStart,
    rngState,
    recentSpawns,
    idleSwipes: 0,
    undosRemaining: CONFIG.UNDO_COUNT,
    undoStack: [],
    elapsedMs: 0,
    handsCompleted: 0,
    setsCreated: 0,
    suitCounts: { dot: 0, bam: 0, crak: 0 },
    rack: [],
  };
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

export type MoveOutcome = {
  state: GameState;
  changed: boolean;
  events: CombineEvent[];
  newlyFilled: string[];
  handCompleted: boolean;
  gameOver: boolean;
  scoreDelta: number;
  // Animation payload from the raw move.
  slides: ReturnType<typeof applyMove>["slides"];
  merges: ReturnType<typeof applyMove>["merges"];
  spawnedCell: number | null;
  spawnedTile: Tile | null;
  /** The board edge the spawned tile visually enters from (opposite the swipe). */
  spawnEntry: Direction | null;
};

export function move(state: GameState, direction: Direction): MoveOutcome {
  if (state.status !== "playing") {
    return {
      state,
      changed: false,
      events: [],
      newlyFilled: [],
      handCompleted: false,
      gameOver: false,
      scoreDelta: 0,
      slides: [],
      merges: [],
      spawnedCell: null,
      spawnedTile: null,
      spawnEntry: null,
    };
  }

  const ruleOpts = ruleOptsFor(state);
  const snap = snapshot(state);
  const raw = applyMove(state.board, direction, ruleOpts);

  if (!raw.changed) {
    // Invalid move: no tile spawns, nothing changes.
    return {
      state,
      changed: false,
      events: [],
      newlyFilled: [],
      handCompleted: false,
      gameOver: false,
      scoreDelta: 0,
      slides: raw.slides,
      merges: raw.merges,
      spawnedCell: null,
      spawnedTile: null,
      spawnEntry: null,
    };
  }

  // Score the combinations and tally set statistics.
  let scoreDelta = scoreForEvents(raw.events);
  const suitCounts = { ...state.suitCounts };
  for (const e of raw.events) {
    const suit = e.tile.suit as Suit | undefined;
    if (suit) suitCounts[suit] += 1;
  }
  const setsCreated = state.setsCreated + raw.events.length;

  // Reconcile targets against the post-move board (update target progress).
  const reconciled = reconcileTargets(state.target, raw.board);
  scoreDelta += reconciled.newlyFilled.length * SCORING.targetSlot;

  // Spawn model: EVERY valid swipe (this branch only runs when raw.changed) adds
  // exactly one new tile. A combining swipe removed what it fused, so the fresh
  // tile nets the board back — skilled play keeps it flowing; idle shuffling
  // fills it. The hand is never spawned onto once complete.
  let spawn: SpawnOutcome = {
    board: reconciled.board,
    wall: state.wall,
    rngState: state.rngState,
    recentSpawns: state.recentSpawns,
    spawnedCell: null,
    spawnedTile: null,
  };

  if (!reconciled.complete) {
    // Recalculate achievability against the finite wall and, if a required tile
    // is starving (or scarce in the wall), steer the draw toward it — the
    // fairness guarantee that a hand stays winnable while the wall allows it.
    const projectedState = { ...state, board: reconciled.board, target: reconciled.target };
    const solvability = evaluateHandSolvability(projectedState, reconciled.target, state.wall);
    const steer =
      solvability.confidence < STEER_CONFIDENCE
        ? steerTypeForTarget(projectedState, reconciled.target)
        : null;

    spawn = spawnOne(
      reconciled.board,
      reconciled.target,
      state.wall,
      state.rngState,
      state.recentSpawns,
      wallConfigFor(state.learning),
      direction,
      learningPool(state.learning),
      steer,
    );
  }

  // Track swipes that made no set progress. Reset on any combine or target
  // fill; accumulate on pure shuffles. Only matters once the wall is empty.
  const madeProgress = raw.events.length > 0 || reconciled.newlyFilled.length > 0;
  const idleSwipes = madeProgress ? 0 : state.idleSwipes + 1;

  const handCompleted = reconciled.complete;
  const wallEmpty = spawn.wall.length === 0;
  const noMoves = !hasAnyMove(spawn.board, ruleOpts);
  const boardFull = emptyCells(spawn.board).length === 0;
  // Finite-wall endgame. Game over when: no move can change the board and no
  // help is coming (board full, or the wall is spent); or the wall is spent and
  // the hand can no longer be completed from what remains; or the wall is spent
  // and the player has shuffled STALEMATE_IDLE swipes without any progress (the
  // board is solvable in principle but the player is stuck — a wall-game draw).
  let gameOver = !handCompleted && noMoves && (boardFull || wallEmpty);
  if (!handCompleted && !gameOver && wallEmpty) {
    if (idleSwipes >= STALEMATE_IDLE) {
      gameOver = true;
    } else {
      const finalState = { ...state, board: spawn.board, target: reconciled.target };
      if (!evaluateHandSolvability(finalState, reconciled.target, spawn.wall).solvable) {
        gameOver = true;
      }
    }
  }

  // Undo history: push the pre-move snapshot, bounded to the free-undo count.
  const undoStack = [...state.undoStack, snap].slice(-CONFIG.UNDO_COUNT);

  const nextState: GameState = {
    ...state,
    board: spawn.board,
    score: state.score + scoreDelta,
    target: reconciled.target,
    wall: spawn.wall,
    rngState: spawn.rngState,
    recentSpawns: spawn.recentSpawns,
    idleSwipes,
    setsCreated,
    suitCounts,
    status: handCompleted ? "won-hand" : gameOver ? "game-over" : "playing",
    undoStack,
  };

  return {
    state: nextState,
    changed: true,
    events: raw.events,
    newlyFilled: reconciled.newlyFilled,
    handCompleted,
    gameOver,
    scoreDelta,
    slides: raw.slides,
    merges: raw.merges,
    spawnedCell: spawn.spawnedCell,
    spawnedTile: spawn.spawnedTile,
    spawnEntry: spawn.spawnedTile ? entryEdgeForSwipe(direction) : null,
  };
}

/** The visual edge a spawn enters from, given the swipe that caused it. */
function entryEdgeForSwipe(direction: Direction): Direction {
  switch (direction) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "up":
      return "down";
    case "down":
      return "up";
  }
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/** True if the player can still undo (has undos left and history to restore). */
export function canUndo(state: GameState): boolean {
  return state.undosRemaining > 0 && state.undoStack.length > 0;
}

export function undo(state: GameState): GameState {
  if (!canUndo(state)) return state;
  const stack = [...state.undoStack];
  const snap = stack.pop()!;
  const restored = restoreSnapshot(state, snap);
  return {
    ...restored,
    undoStack: stack,
    undosRemaining: state.undosRemaining - 1,
  };
}

// ---------------------------------------------------------------------------
// Hand completion → next round
// ---------------------------------------------------------------------------

export type HandCompletionResult = {
  state: GameState;
  bonus: number;
  emptyCells: number;
  removedTiles: number;
  /** Set when a learning hand was just completed: what comes next. */
  learningAdvance?: {
    completedStage: LearningStage;
    nextStage: LearningStage | null; // null = learning finished, endless begins
  };
};

export function completeHand(state: GameState): HandCompletionResult {
  const empties = emptyCells(state.board).length;
  const bonus = handCompletionScore(state.multiplier, empties);

  // Cash in the sets that fulfilled this hand: they are removed from the board,
  // which both scores the hand and creates breathing room. Loose tiles and any
  // *extra* unspent sets carry over as a head start on the next hand. Because
  // scored sets leave the board, no set can ever be counted toward two hands.
  const cashedIds = new Set<string>();
  for (const r of state.target.requirements) if (r.filledBy) cashedIds.add(r.filledBy);
  // Capture the banked sets for the rack (spent tiles, out of circulation).
  const bankedTiles: Tile[] = state.board
    .filter((t): t is Tile => !!t && cashedIds.has(t.id))
    .map((t) => ({ ...t }));
  const bankedHand: RackHand = {
    id: `hand-${state.handsCompleted + 1}`,
    name: state.target.name,
    round: state.round,
    tiles: bankedTiles,
  };
  const board: Board = state.board.map((t) => (t && cashedIds.has(t.id) ? null : t));

  // Learning progression: each learning hand advances one stage; after the
  // fourth, endless mode begins (round resets so the difficulty ramp starts
  // from its easy tier — the player keeps their score).
  let learningAdvance: HandCompletionResult["learningAdvance"];
  let nextLearning: LearningStage | undefined = undefined;
  let nextRound = state.round + 1;
  let pattern: TargetPattern;
  let rngAfterPick = state.rngState;
  // Learning always deals its fixed next hand; endless must find one the wall
  // can still build, or the run ends.
  let wallCanDeal = !!state.learning;

  if (state.learning) {
    const completedStage = state.learning;
    if (completedStage < 4) {
      nextLearning = (completedStage + 1) as LearningStage;
      pattern = instantiateLearningPattern(nextLearning);
      learningAdvance = { completedStage, nextStage: nextLearning };
    } else {
      nextLearning = undefined;
      nextRound = 1;
      pattern = instantiatePattern(OPENING_PATTERN_ID);
      learningAdvance = { completedStage, nextStage: null };
    }
  } else {
    // Fairness gate: find a candidate hand achievable from the cashed board +
    // the tiles remaining in the wall. If NONE of several candidates can be
    // built, the wall can no longer produce a valid hand — the run is over.
    let picked = pickPatternForRound(nextRound, state.target.id, state.rngState);
    for (let attempt = 0; attempt < 6; attempt++) {
      const probe = reconcileTargets(picked.pattern, board);
      const probeState: GameState = {
        ...state,
        board: probe.board,
        round: nextRound,
        learning: undefined,
        target: probe.target,
      };
      if (evaluateHandSolvability(probeState, probe.target, state.wall).solvable) {
        wallCanDeal = true;
        break;
      }
      picked = pickPatternForRound(nextRound, picked.pattern.id, picked.rngState);
    }
    pattern = picked.pattern;
    rngAfterPick = picked.rngState;
  }

  const reconciled = reconcileTargets(pattern, board);

  // Guarantee the next round is playable. If cashing in the hand left the board
  // empty (or nearly so — e.g. the whole board WAS the four scoring sets), seed
  // fresh tiles FROM THE WALL. If the wall is spent, we seed what we can and let
  // the finite endgame play out. Without this the board can dead-lock: no tiles
  // to move means no move, and spawns only happen after a move.
  let seededBoard = reconciled.board;
  let wall = state.wall;
  let rngState = rngAfterPick;
  let recentSpawns = state.recentSpawns;
  let tileCount = seededBoard.filter(Boolean).length;
  const allowed = learningPool(nextLearning);
  const cfg = wallConfigFor(nextLearning);
  while (tileCount < MIN_TILES_AFTER_HAND) {
    const out = spawnOne(
      seededBoard,
      reconciled.target,
      wall,
      rngState,
      recentSpawns,
      cfg,
      undefined,
      allowed,
    );
    if (out.spawnedTile == null) break; // board full, or the wall is spent
    seededBoard = out.board;
    wall = out.wall;
    rngState = out.rngState;
    recentSpawns = out.recentSpawns;
    tileCount++;
  }

  const nextState: GameState = {
    ...state,
    board: seededBoard,
    target: reconciled.target,
    score: state.score + bonus,
    round: nextRound,
    multiplier: Math.round((state.multiplier + SCORING.multiplierStep) * 100) / 100,
    handsCompleted: state.handsCompleted + 1,
    learning: nextLearning,
    wall,
    rngState,
    recentSpawns,
    idleSwipes: 0,
    rack: [...state.rack, bankedHand],
    // A new hand starts a fresh undo history (can't undo across a Mahj).
    undoStack: [],
    // If the wall can no longer build any hand, the run ends on this bank.
    status: wallCanDeal ? "playing" : "game-over",
  };

  return {
    state: nextState,
    bonus,
    emptyCells: empties,
    removedTiles: cashedIds.size,
    learningAdvance,
  };
}

/** Force a fresh target pattern (debug / testing). */
export function setTarget(state: GameState, templateId: string): GameState {
  const pattern = instantiatePattern(templateId);
  const reconciled = reconcileTargets(pattern, state.board);
  return { ...state, target: reconciled.target, board: reconciled.board };
}
