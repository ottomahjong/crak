import type {
  Board,
  CombineEvent,
  Direction,
  GameSnapshot,
  GameState,
  Suit,
  Tile,
  TargetPattern,
  TileTypeId,
} from "@/types";
import { CELL_COUNT } from "@/types";
import { applyMove, hasAnyMove } from "@/game/rules/movement";
import { reconcileTargets } from "@/game/rules/targets";
import { scoreForEvents, handCompletionScore, SCORING } from "@/game/scoring";
import {
  buildBag,
  drawTile,
  pickEmptyCell,
  helpfulSpawn,
  REINFORCE_P,
  JOKER_SPAWN_P,
} from "@/game/generator";
import { nextRandom, randomSeed } from "@/lib/rng";
import {
  instantiatePattern,
  pickPatternForRound,
  OPENING_PATTERN_ID,
} from "@/data/targets";
import { makeLooseFromType } from "@/game/tiles";

const STARTING_TILES = 4;
/** Minimum tiles the board must hold after a hand cashes in, to stay playable. */
const MIN_TILES_AFTER_HAND = 4;

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
    elapsedMs: state.elapsedMs,
    handsCompleted: state.handsCompleted,
    setsCreated: state.setsCreated,
    suitCounts: { ...state.suitCounts },
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
    elapsedMs: snap.elapsedMs,
    handsCompleted: snap.handsCompleted,
    setsCreated: snap.setsCreated,
    suitCounts: { ...snap.suitCounts },
    // Undo is consumed by the caller.
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

function spawnOne(
  board: Board,
  target: TargetPattern,
  bag: GameState["bag"],
  rngState: number,
  recentSpawns: GameState["recentSpawns"],
): SpawnOutcome {
  const empties = emptyCells(board);
  if (empties.length === 0) {
    return { board, bag, rngState, recentSpawns, spawnedCell: null, spawnedTile: null };
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
  if (jokerRoll.value < JOKER_SPAWN_P && lastSpawn !== "joker") {
    const placedJ = pickEmptyCell(empties, rs);
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
  const roll = nextRandom(rs);
  rs = roll.state;

  let reinforced: TileTypeId | null = null;
  if (roll.value < REINFORCE_P) {
    // Fairness: once a tile has been spawned twice in a row, tell reinforcement
    // to pick a *different* helpful tile rather than flooding one type.
    const last = recentSpawns[recentSpawns.length - 1];
    let trailing = 0;
    for (let i = recentSpawns.length - 1; i >= 0 && recentSpawns[i] === last; i--) trailing++;
    const avoid = trailing >= 2 ? last : undefined;
    const h = helpfulSpawn(board, target, rs, avoid);
    rs = h.rngState;
    reinforced = h.type;
  }

  if (reinforced) {
    type = reinforced;
    nextRecent = [...recentSpawns, type].slice(-8);
  } else {
    const draw = drawTile({ bag, rngState: rs, recentSpawns }, target, board);
    type = draw.type;
    nextBag = draw.bag;
    rs = draw.rngState;
    nextRecent = draw.recentSpawns;
  }

  const placed = pickEmptyCell(empties, rs);
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

export function createInitialState(seed = randomSeed()): GameState {
  const target = instantiatePattern(OPENING_PATTERN_ID);
  let board: Board = new Array(CELL_COUNT).fill(null);
  let bag: GameState["bag"] = [];
  let rngState = seed >>> 0 || 1;
  let recentSpawns: GameState["recentSpawns"] = [];

  // Prime the bag.
  const primed = buildBag(target, rngState, board);
  bag = primed.bag;
  rngState = primed.rngState;

  for (let i = 0; i < STARTING_TILES; i++) {
    const out = spawnOne(board, target, bag, rngState, recentSpawns);
    board = out.board;
    bag = out.bag;
    rngState = out.rngState;
    recentSpawns = out.recentSpawns;
  }

  return {
    board,
    score: 0,
    round: 1,
    multiplier: 1,
    target,
    status: "playing",
    bag,
    rngState,
    recentSpawns,
    undoAvailable: true,
    undoSnapshot: null,
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
    };
  }

  const snap = snapshot(state);
  const raw = applyMove(state.board, direction);

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

  // Reconcile targets against the post-move board.
  const reconciled = reconcileTargets(state.target, raw.board);
  scoreDelta += reconciled.newlyFilled.length * SCORING.targetSlot;

  // Spawn one new tile — UNLESS this move made a combination. Combining is what
  // buys breathing room on a 16-cell board: skilful merges hold the flood back,
  // while "dead" slides that only shuffle tiles keep the board advancing. This
  // is the key lever that lets a player assemble a four-set hand before the
  // board chokes on un-combinable loose tiles.
  const combined = raw.events.length > 0;
  const spawn = combined
    ? {
        board: reconciled.board,
        bag: state.bag,
        rngState: state.rngState,
        recentSpawns: state.recentSpawns,
        spawnedCell: null,
        spawnedTile: null,
      }
    : spawnOne(
        reconciled.board,
        reconciled.target,
        state.bag,
        state.rngState,
        state.recentSpawns,
      );

  const handCompleted = reconciled.complete;
  const gameOver =
    !handCompleted && emptyCells(spawn.board).length === 0 && !hasAnyMove(spawn.board);

  const nextState: GameState = {
    ...state,
    board: spawn.board,
    score: state.score + scoreDelta,
    target: reconciled.target,
    bag: spawn.bag,
    rngState: spawn.rngState,
    recentSpawns: spawn.recentSpawns,
    setsCreated,
    suitCounts,
    status: handCompleted ? "won-hand" : gameOver ? "game-over" : "playing",
    undoAvailable: state.undoAvailable,
    undoSnapshot: state.undoAvailable ? snap : state.undoSnapshot,
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
  };
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

export function undo(state: GameState): GameState {
  if (!state.undoAvailable || !state.undoSnapshot) return state;
  const restored = restoreSnapshot(state, state.undoSnapshot);
  return { ...restored, undoAvailable: false, undoSnapshot: null };
}

// ---------------------------------------------------------------------------
// Hand completion → next round
// ---------------------------------------------------------------------------

export type HandCompletionResult = {
  state: GameState;
  bonus: number;
  emptyCells: number;
  removedTiles: number;
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

  const nextRound = state.round + 1;
  const picked = pickPatternForRound(nextRound, state.target.id, state.rngState);
  const reconciled = reconcileTargets(picked.pattern, board);

  // Guarantee the next round is playable. If cashing in the hand left the board
  // empty (or nearly so — e.g. the whole board WAS the four scoring sets), seed
  // fresh tiles. Without this the board can dead-lock: no tiles to move means no
  // move, and spawns only happen after a move.
  let seededBoard = reconciled.board;
  let bag = state.bag;
  let rngState = picked.rngState;
  let recentSpawns = state.recentSpawns;
  let tileCount = seededBoard.filter(Boolean).length;
  while (tileCount < MIN_TILES_AFTER_HAND) {
    const out = spawnOne(seededBoard, reconciled.target, bag, rngState, recentSpawns);
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
    bag,
    rngState,
    recentSpawns,
    status: "playing",
  };

  return { state: nextState, bonus, emptyCells: empties, removedTiles: cashedIds.size };
}

/** Force a fresh target pattern (debug / testing). */
export function setTarget(state: GameState, templateId: string): GameState {
  const pattern = instantiatePattern(templateId);
  const reconciled = reconcileTargets(pattern, state.board);
  return { ...state, target: reconciled.target, board: reconciled.board };
}
