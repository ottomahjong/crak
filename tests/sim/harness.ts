import type { Board, CombineEvent, Direction, GameState, TargetPattern, Tile, TileTypeId } from "@/types";
import { createInitialState, move, completeHand } from "@/game/state/game";
import { applyMove } from "@/game/rules/movement";
import { reconcileTargets } from "@/game/rules/targets";
import { tileTypeOf } from "@/game/tiles";

// ---------------------------------------------------------------------------
// Headless play-testing harness. The engine is React-free, so we can run a
// heuristic AI over thousands of moves and gather balance metrics.
// ---------------------------------------------------------------------------

const DIRS: Direction[] = ["up", "down", "left", "right"];

function filledCount(t: TargetPattern): number {
  return t.requirements.filter((r) => r.filledBy).length;
}

function eventWeight(e: CombineEvent): number {
  switch (e.type) {
    case "run":
      return 40;
    case "dragon-pung":
      return 42;
    case "pung":
      return 32;
    case "dragon-pair":
      return 14;
    case "pair":
      return 7;
    default:
      return 0;
  }
}

/** Board-level "potential": rewards collecting tiles that lead to needed sets. */
function potential(board: Board): number {
  const groups = new Map<string, number>();
  const suitRanks = new Map<string, Set<number>>();
  for (const t of board) {
    if (!t || t.state !== "loose") continue;
    const key = t.isJoker ? "joker" : t.dragon ? `d-${t.dragon}` : `${t.suit}-${t.rank}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
    if (t.suit && t.rank) {
      const s = suitRanks.get(t.suit) ?? new Set<number>();
      s.add(t.rank);
      suitRanks.set(t.suit, s);
    }
  }
  let p = 0;
  for (const [, c] of groups) if (c >= 2) p += (c - 1) * 2;
  for (const [, ranks] of suitRanks) if (ranks.size === 3) p += 6;
  return p;
}

function evaluate(state: GameState, dir: Direction): number | null {
  const res = applyMove(state.board, dir);
  if (!res.changed) return null;
  const rec = reconcileTargets(state.target, res.board);
  const slotGain = filledCount(rec.target) - filledCount(state.target);
  let score = slotGain * 1000;
  for (const e of res.events) score += eventWeight(e);
  const empties = rec.board.filter((c) => c === null).length;
  score += empties * 10;
  score += potential(rec.board);

  // A good player avoids making completed sets the current hand doesn't need —
  // surplus sets are permanent clutter until a future hand happens to want them.
  const used = new Set(rec.target.requirements.map((r) => r.filledBy).filter(Boolean));
  let surplus = 0;
  for (const t of rec.board) if (t && t.state === "completed" && !used.has(t.id)) surplus++;
  score -= surplus * 45;

  return score;
}

/** Choose the best legal direction, or null if no move changes the board. */
export function chooseMove(state: GameState): Direction | null {
  let best: Direction | null = null;
  let bestScore = -Infinity;
  for (const dir of DIRS) {
    const v = evaluate(state, dir);
    if (v == null) continue;
    if (v > bestScore) {
      bestScore = v;
      best = dir;
    }
  }
  return best;
}

export type GameRecord = {
  seed: number;
  moves: number;
  hands: number;
  score: number;
  round: number;
  ended: "game-over" | "capped";
  setsCreated: number;
  events: Record<string, number>;
  // per-hand move costs
  handMoveCosts: number[];
  cascadeHands: number; // hands completed in <=1 move (leftover-set cascades)
  spawns: TileTypeId[];
  patternInstances: { id: string; moves: number; completed: boolean }[];
  // longest streak of identical consecutive spawns
  maxConsecutiveSpawn: number;
};

export function runGame(seed: number, moveCap = 20000): GameRecord {
  let state = createInitialState(seed);
  const events: Record<string, number> = {};
  const handMoveCosts: number[] = [];
  const spawns: TileTypeId[] = [];
  const patternInstances: { id: string; moves: number; completed: boolean }[] = [
    { id: state.target.id, moves: 0, completed: false },
  ];
  let moves = 0;
  let hands = 0;
  let cascadeHands = 0;
  let movesThisHand = 0;
  let ended: "game-over" | "capped" = "capped";

  while (moves < moveCap) {
    if (state.status === "won-hand") {
      handMoveCosts.push(movesThisHand);
      if (movesThisHand <= 1) cascadeHands++;
      patternInstances[patternInstances.length - 1].completed = true;
      const r = completeHand(state);
      state = r.state;
      hands++;
      movesThisHand = 0;
      patternInstances.push({ id: state.target.id, moves: 0, completed: false });
      continue;
    }
    if (state.status === "game-over") {
      ended = "game-over";
      break;
    }
    const dir = chooseMove(state);
    if (!dir) {
      // No legal move but engine hasn't flagged game-over (board not full).
      ended = "game-over";
      break;
    }
    const out = move(state, dir);
    if (!out.changed) {
      ended = "game-over";
      break;
    }
    state = out.state;
    moves++;
    movesThisHand++;
    patternInstances[patternInstances.length - 1].moves++;
    for (const e of out.events) events[e.type] = (events[e.type] ?? 0) + 1;
    if (out.spawnedTile) {
      const tt = tileTypeOf(out.spawnedTile);
      if (tt) spawns.push(tt);
    }
  }

  // max consecutive identical spawn
  let maxRun = 0;
  let cur = 0;
  let prev: TileTypeId | null = null;
  for (const s of spawns) {
    if (s === prev) cur++;
    else cur = 1;
    prev = s;
    if (cur > maxRun) maxRun = cur;
  }

  return {
    seed,
    moves,
    hands,
    score: state.score,
    round: state.round,
    ended,
    setsCreated: state.setsCreated,
    events,
    handMoveCosts,
    cascadeHands,
    spawns,
    patternInstances,
    maxConsecutiveSpawn: maxRun,
  };
}

// --- stats helpers ---------------------------------------------------------

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

export function summarize(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    min: s[0] ?? 0,
    p10: Math.round(quantile(s, 0.1)),
    p25: Math.round(quantile(s, 0.25)),
    median: Math.round(quantile(s, 0.5)),
    mean: Math.round(sum / (s.length || 1)),
    p75: Math.round(quantile(s, 0.75)),
    p90: Math.round(quantile(s, 0.9)),
    max: s[s.length - 1] ?? 0,
  };
}

export function boardTypeHash(board: Board): string {
  return board
    .map((t) => {
      if (!t) return ".";
      if (t.state === "loose") return tileTypeOf(t) ?? "?";
      return `${t.setKind}:${t.suit ?? ""}${t.rank ?? ""}${t.dragon ?? ""}`;
    })
    .join("|");
}
