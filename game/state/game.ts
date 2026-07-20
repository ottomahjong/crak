import type {
  Board,
  CombineEvent,
  Direction,
  GameSnapshot,
  GameState,
  LearningStage,
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
  buildBag,
  drawTile,
  pickEmptyCell,
  helpfulSpawn,
  REINFORCE_P,
  REINFORCE_P_MAX,
  REINFORCE_P_CONGESTION,
  JOKER_SPAWN_P,
} from "@/game/generator";
import { nextRandom, randomSeed } from "@/lib/rng";
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
    bag: [...state.bag],
    rngState: state.rngState,
    recentSpawns: [...state.recentSpawns],
    movesSinceSpawn: state.movesSinceSpawn,
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
    bag: [...snap.bag],
    rngState: snap.rngState,
    recentSpawns: [...snap.recentSpawns],
    movesSinceSpawn: snap.movesSinceSpawn,
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
  bag: GameState["bag"];
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
  bag: GameState["bag"],
  rngState: number,
  recentSpawns: GameState["recentSpawns"],
  direction?: Direction,
  allowed?: ReadonlySet<TileTypeId>,
  forcedType?: TileTypeId | null,
): SpawnOutcome {
  const empties = emptyCells(board);
  if (empties.length === 0) {
    return { board, bag, rngState, recentSpawns, spawnedCell: null, spawnedTile: null };
  }

  // Solvability steering: when a required tile is starving, the caller forces
  // its type so a hand never dies of bad luck. Placed straight away, bypassing
  // the joker roll / reinforcement / bag draw.
  if (forcedType && (!allowed || allowed.has(forcedType))) {
    const placedF = pickSpawnCell(board, direction, rngState);
    const fTile = makeLooseFromType(forcedType);
    const fb = board.slice();
    fb[placedF.cell] = fTile;
    return {
      board: fb,
      bag,
      rngState: placedF.rngState,
      recentSpawns: [...recentSpawns, forcedType].slice(-8),
      spawnedCell: placedF.cell,
      spawnedTile: fTile,
    };
  }

  let rs = rngState;
  let type: TileTypeId;
  let nextBag = bag;
  let nextRecent = recentSpawns;

  // Small flat chance of a Joker so this taught, wild mechanic actually shows up
  // (the fair bag alone, diluted by reinforcement, made jokers almost invisible).
  // Never two jokers in a row.
  const jokerRoll = nextRandom(rs);
  rs = jokerRoll.state;
  const lastSpawn = recentSpawns[recentSpawns.length - 1];
  const jokerAllowed = !allowed || allowed.has("joker");
  if (jokerAllowed && jokerRoll.value < JOKER_SPAWN_P && lastSpawn !== "joker") {
    const placedJ = pickSpawnCell(board, direction, rs);
    const jokerTile = makeLooseFromType("joker");
    const jb = board.slice();
    jb[placedJ.cell] = jokerTile;
    return {
      board: jb,
      bag,
      rngState: placedJ.rngState,
      recentSpawns: [...recentSpawns, "joker" as TileTypeId].slice(-8),
      spawnedCell: placedJ.cell,
      spawnedTile: jokerTile,
    };
  }

  // Roll for a reinforcement spawn (a tile that combines with the board) vs a
  // fair-bag draw. Reinforcement keeps the board from choking on random junk.
  // Because every swipe now spawns, a congested board needs combinable tiles
  // urgently — so the reinforcement chance rises with board fullness (empty
  // cells falling), giving the player the pieces to combine the board back down.
  const roll = nextRandom(rs);
  rs = roll.state;

  const fullness = 1 - empties.length / CELL_COUNT; // 0 empty-ish … 1 nearly full
  const reinforceP = Math.min(REINFORCE_P_MAX, REINFORCE_P + fullness * REINFORCE_P_CONGESTION);

  let reinforced: TileTypeId | null = null;
  if (roll.value < reinforceP) {
    // Fairness: once a tile has been spawned twice in a row, tell reinforcement
    // to pick a *different* helpful tile rather than flooding one type.
    const last = recentSpawns[recentSpawns.length - 1];
    let trailing = 0;
    for (let i = recentSpawns.length - 1; i >= 0 && recentSpawns[i] === last; i--) trailing++;
    const avoid = trailing >= 2 ? last : undefined;
    const h = helpfulSpawn(board, target, rs, avoid, allowed);
    rs = h.rngState;
    reinforced = h.type;
  }

  if (reinforced) {
    type = reinforced;
    nextRecent = [...recentSpawns, type].slice(-8);
  } else {
    const draw = drawTile({ bag, rngState: rs, recentSpawns }, target, board, allowed);
    type = draw.type;
    nextBag = draw.bag;
    rs = draw.rngState;
    nextRecent = draw.recentSpawns;
  }

  const placed = pickSpawnCell(board, direction, rs);
  const tile = makeLooseFromType(type);
  const nextBoard = board.slice();
  nextBoard[placed.cell] = tile;
  return {
    board: nextBoard,
    bag: nextBag,
    rngState: placed.rngState,
    recentSpawns: nextRecent,
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
  let bag: GameState["bag"] = [];
  let rngState = seed >>> 0 || 1;
  let recentSpawns: GameState["recentSpawns"] = [];
  const allowed = learningPool(learning);

  // Prime the bag.
  const primed = buildBag(target, rngState, board, allowed);
  bag = primed.bag;
  rngState = primed.rngState;

  if (learning === 1) {
    // Fixed opening for the very first hand, tuned for ONE-STEP movement: the
    // two 1 Dots are two cells apart in a row, so the player learns "one swipe =
    // one space" (bring them adjacent) then "swipe again to combine" — the
    // first pair in ~2 swipes. Two 2 Dots seed the pung.
    board[4] = makeLooseFromType("dot-1"); // row 1, col 0 (at the edge)
    board[6] = makeLooseFromType("dot-1"); // row 1, col 2
    board[9] = makeLooseFromType("dot-2"); // row 2, col 1
    board[11] = makeLooseFromType("dot-2"); // row 2, col 3
  } else {
    const count = learning ? CONFIG.INITIAL_TILES_BEGINNER : CONFIG.INITIAL_TILES;
    for (let i = 0; i < count; i++) {
      const out = spawnOne(board, target, bag, rngState, recentSpawns, undefined, allowed);
      board = out.board;
      bag = out.bag;
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
    bag,
    rngState,
    recentSpawns,
    movesSinceSpawn: 0,
    undosRemaining: CONFIG.UNDO_COUNT,
    undoStack: [],
    elapsedMs: 0,
    handsCompleted: 0,
    setsCreated: 0,
    suitCounts: { dot: 0, bam: 0, crak: 0 },
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
  let spawn = {
    board: reconciled.board,
    bag: state.bag,
    rngState: state.rngState,
    recentSpawns: state.recentSpawns,
    spawnedCell: null as number | null,
    spawnedTile: null as Tile | null,
  };

  if (!reconciled.complete) {
    // Recalculate achievability and, if a required tile is starving, steer the
    // spawn to supply it — the fairness guarantee that a hand stays winnable.
    const projectedState = { ...state, board: reconciled.board, target: reconciled.target };
    const solvability = evaluateHandSolvability(projectedState, reconciled.target, state.bag);
    const steer =
      solvability.confidence < STEER_CONFIDENCE
        ? steerTypeForTarget(projectedState, reconciled.target)
        : null;

    spawn = spawnOne(
      reconciled.board,
      reconciled.target,
      state.bag,
      state.rngState,
      state.recentSpawns,
      direction,
      learningPool(state.learning),
      steer,
    );
  }

  const handCompleted = reconciled.complete;
  const gameOver =
    !handCompleted &&
    emptyCells(spawn.board).length === 0 &&
    !hasAnyMove(spawn.board, ruleOpts);

  // Undo history: push the pre-move snapshot, bounded to the free-undo count.
  const undoStack = [...state.undoStack, snap].slice(-CONFIG.UNDO_COUNT);

  const nextState: GameState = {
    ...state,
    board: spawn.board,
    score: state.score + scoreDelta,
    target: reconciled.target,
    bag: spawn.bag,
    rngState: spawn.rngState,
    recentSpawns: spawn.recentSpawns,
    movesSinceSpawn: 0, // vestigial: every valid swipe now spawns
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
  const board: Board = state.board.map((t) => (t && cashedIds.has(t.id) ? null : t));

  // Learning progression: each learning hand advances one stage; after the
  // fourth, endless mode begins (round resets so the difficulty ramp starts
  // from its easy tier — the player keeps their score).
  let learningAdvance: HandCompletionResult["learningAdvance"];
  let nextLearning: LearningStage | undefined = undefined;
  let nextRound = state.round + 1;
  let pattern: TargetPattern;
  let rngAfterPick = state.rngState;

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
    // Fairness gate: verify the candidate hand is achievable from the cashed
    // board + supply before presenting it; re-roll a few times if not.
    let picked = pickPatternForRound(nextRound, state.target.id, state.rngState);
    for (let attempt = 0; attempt < 4; attempt++) {
      const probe = reconcileTargets(picked.pattern, board);
      const probeState: GameState = {
        ...state,
        board: probe.board,
        round: nextRound,
        learning: undefined,
      };
      if (evaluateHandSolvability(probeState, probe.target, state.bag).solvable) break;
      picked = pickPatternForRound(nextRound, picked.pattern.id, picked.rngState);
    }
    pattern = picked.pattern;
    rngAfterPick = picked.rngState;
  }

  const reconciled = reconcileTargets(pattern, board);

  // Guarantee the next round is playable. If cashing in the hand left the board
  // empty (or nearly so — e.g. the whole board WAS the four scoring sets), seed
  // fresh tiles. Without this the board can dead-lock: no tiles to move means no
  // move, and spawns only happen after a move.
  let seededBoard = reconciled.board;
  let bag = state.bag;
  let rngState = rngAfterPick;
  let recentSpawns = state.recentSpawns;
  let tileCount = seededBoard.filter(Boolean).length;
  const allowed = learningPool(nextLearning);
  while (tileCount < MIN_TILES_AFTER_HAND) {
    const out = spawnOne(
      seededBoard,
      reconciled.target,
      bag,
      rngState,
      recentSpawns,
      undefined,
      allowed,
    );
    if (out.spawnedTile == null) break; // board full (shouldn't happen here)
    seededBoard = out.board;
    bag = out.bag;
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
    bag,
    rngState,
    recentSpawns,
    movesSinceSpawn: 0,
    // A new hand starts a fresh undo history (can't undo across a Mahj).
    undoStack: [],
    status: "playing",
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
