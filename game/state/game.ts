import type {
  Board,
  CombineEvent,
  Direction,
  GameSnapshot,
  GameState,
  Suit,
  Tile,
  TargetPattern,
} from "@/types";
import { CELL_COUNT } from "@/types";
import { applyMove, hasAnyMove } from "@/game/rules/movement";
import { reconcileTargets } from "@/game/rules/targets";
import { scoreForEvents, handCompletionScore, SCORING } from "@/game/scoring";
import { buildBag, drawTile, pickEmptyCell } from "@/game/generator";
import { instantiatePattern, PATTERN_TEMPLATES } from "@/data/targets";
import { isLooseNumber, makeLooseFromType } from "@/game/tiles";
import { randomSeed } from "@/lib/rng";

const STARTING_TILES = 4;

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
  const draw = drawTile({ bag, rngState, recentSpawns }, target);
  const placed = pickEmptyCell(empties, draw.rngState);
  const tile = makeLooseFromType(draw.type);
  const nextBoard = board.slice();
  nextBoard[placed.cell] = tile;
  return {
    board: nextBoard,
    bag: draw.bag,
    rngState: placed.rngState,
    recentSpawns: draw.recentSpawns,
    spawnedCell: placed.cell,
    spawnedTile: tile,
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialState(seed = randomSeed()): GameState {
  const target = instantiatePattern("A");
  let board: Board = new Array(CELL_COUNT).fill(null);
  let bag: GameState["bag"] = [];
  let rngState = seed >>> 0 || 1;
  let recentSpawns: GameState["recentSpawns"] = [];

  // Prime the bag.
  const primed = buildBag(target, rngState);
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

  // Spawn one new tile.
  const spawn = spawnOne(
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

/** Remove up to `count` low-value loose numbered tiles (never completed sets). */
function clearBreathingRoom(
  board: Board,
  count: number,
  rngState: number,
): { board: Board; rngState: number; removed: number } {
  const candidates: number[] = [];
  board.forEach((t, i) => {
    if (t && isLooseNumber(t)) candidates.push(i);
  });
  // Deterministic shuffle of candidate indices.
  let s = rngState;
  for (let i = candidates.length - 1; i > 0; i--) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(rand * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const nextBoard = board.slice();
  const toRemove = candidates.slice(0, count);
  for (const idx of toRemove) nextBoard[idx] = null;
  return { board: nextBoard, rngState: s >>> 0, removed: toRemove.length };
}

function pickNextPattern(currentId: string, rngState: number): { pattern: TargetPattern; rngState: number } {
  const others = PATTERN_TEMPLATES.filter((t) => t.id !== currentId);
  const s = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  const pick = others[Math.floor(rand * others.length)];
  return { pattern: instantiatePattern(pick.id), rngState: s >>> 0 };
}

export function completeHand(state: GameState): HandCompletionResult {
  const empties = emptyCells(state.board).length;
  const bonus = handCompletionScore(state.multiplier, empties);

  // Clear breathing room from the *current* board (completed sets untouched).
  const cleared = clearBreathingRoom(state.board, 3, state.rngState);

  // New target, keeping the board.
  const nextPattern = pickNextPattern(state.target.id, cleared.rngState);
  const reconciled = reconcileTargets(nextPattern.pattern, cleared.board);

  const nextState: GameState = {
    ...state,
    board: reconciled.board,
    target: reconciled.target,
    score: state.score + bonus,
    round: state.round + 1,
    multiplier: Math.round((state.multiplier + SCORING.multiplierStep) * 100) / 100,
    handsCompleted: state.handsCompleted + 1,
    rngState: nextPattern.rngState,
    status: "playing",
  };

  return { state: nextState, bonus, emptyCells: empties, removedTiles: cleared.removed };
}

/** Force a fresh target pattern (debug / testing). */
export function setTarget(state: GameState, templateId: string): GameState {
  const pattern = instantiatePattern(templateId);
  const reconciled = reconcileTargets(pattern, state.board);
  return { ...state, target: reconciled.target, board: reconciled.board };
}
