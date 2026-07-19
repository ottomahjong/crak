import { describe, it, expect } from "vitest";
import {
  createInitialState,
  move,
  completeHand,
  ruleOptsFor,
} from "@/game/state/game";
import { applyMove } from "@/game/rules/movement";
import { reconcileTargets } from "@/game/rules/targets";
import { summarize } from "./harness";
import type { CombineEvent, Direction, GameState } from "@/types";

// Learning-aware greedy player: evaluates each direction with the rules the
// current stage actually uses, then commits the best real move.
function scoreEvents(events: CombineEvent[]): number {
  let s = 0;
  for (const e of events) {
    if (e.type === "pung" || e.type === "dragon-pung") s += 60;
    else if (e.type === "run") s += 55;
    else if (e.type === "pair" || e.type === "dragon-pair") s += 20;
    else if (e.type === "partial-run") s += 15;
  }
  return s;
}

function chooseLearningMove(state: GameState): Direction | null {
  const opts = ruleOptsFor(state);
  let best: Direction | null = null;
  let bestScore = -Infinity;
  for (const dir of ["up", "down", "left", "right"] as Direction[]) {
    const res = applyMove(state.board, dir, opts);
    if (!res.changed) continue;
    const rec = reconcileTargets(state.target, res.board);
    const filledBefore = state.target.requirements.filter((r) => r.filledBy).length;
    const filledAfter = rec.target.requirements.filter((r) => r.filledBy).length;
    const empties = res.board.filter((c) => c === null).length;
    const s = (filledAfter - filledBefore) * 1000 + scoreEvents(res.events) + empties * 4;
    if (s > bestScore) {
      bestScore = s;
      best = dir;
    }
  }
  return best;
}

type Result = {
  completedHand1: boolean;
  gameOverInHand1: boolean;
  movesToPair: number | null;
  movesToPung: number | null;
  movesToMahj: number | null;
};

function playHand1(seed: number, moveCap = 60): Result {
  let s = createInitialState(seed, 1);
  let moves = 0;
  let movesToPair: number | null = null;
  let movesToPung: number | null = null;
  let movesToMahj: number | null = null;

  while (moves < moveCap) {
    if (s.status === "won-hand") {
      movesToMahj = moves;
      return { completedHand1: true, gameOverInHand1: false, movesToPair, movesToPung, movesToMahj };
    }
    if (s.status === "game-over") {
      return { completedHand1: false, gameOverInHand1: true, movesToPair, movesToPung, movesToMahj };
    }
    const dir = chooseLearningMove(s);
    if (!dir) return { completedHand1: false, gameOverInHand1: true, movesToPair, movesToPung, movesToMahj };
    const out = move(s, dir);
    if (!out.changed) break;
    moves += 1;
    if (movesToPair == null && out.events.some((e) => e.type === "pair")) movesToPair = moves;
    if (movesToPung == null && out.events.some((e) => e.type === "pung")) movesToPung = moves;
    s = out.state;
  }
  return { completedHand1: false, gameOverInHand1: false, movesToPair, movesToPung, movesToMahj };
}

describe("learning hand 1 is strongly winnable", () => {
  it("measures onboarding metrics across 200 first games", () => {
    const N = 200;
    const results: Result[] = [];
    for (let i = 0; i < N; i++) results.push(playHand1(1000 + i * 6151));

    const completed = results.filter((r) => r.completedHand1).length;
    const gameOvers = results.filter((r) => r.gameOverInHand1).length;
    const pairMoves = results.map((r) => r.movesToPair).filter((n): n is number => n != null);
    const pungMoves = results.map((r) => r.movesToPung).filter((n): n is number => n != null);
    const mahjMoves = results.map((r) => r.movesToMahj).filter((n): n is number => n != null);

    /* eslint-disable no-console */
    console.log("\n===== learning hand 1 (200 first games) =====");
    console.log(`completed hand 1: ${completed}/${N} (${Math.round((100 * completed) / N)}%)`);
    console.log(`game over during hand 1: ${gameOvers}/${N}`);
    console.log("moves to first PAIR:", summarize(pairMoves));
    console.log("moves to first PUNG:", summarize(pungMoves));
    console.log("moves to first MAHJ:", summarize(mahjMoves));
    console.log("=============================================\n");
    /* eslint-enable no-console */

    // The learning hand must be biased hard toward success.
    expect(completed / N).toBeGreaterThan(0.95);
    expect(gameOvers).toBe(0);
    // First pair fast; first Mahj within a short, teachable window. (A pung
    // needs a third specific tile, so it lands close to the Mahj itself.)
    expect(summarize(pairMoves).median).toBeLessThanOrEqual(3);
    expect(summarize(pungMoves).median).toBeLessThanOrEqual(11);
    expect(summarize(mahjMoves).median).toBeLessThanOrEqual(15);
    expect(summarize(mahjMoves).p90).toBeLessThanOrEqual(22);
  }, 60000);
});
