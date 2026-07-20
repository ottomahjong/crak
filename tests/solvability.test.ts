import { describe, it, expect } from "vitest";
import { evaluateHandSolvability, steerTypeForTarget } from "@/game/solvability";
import { createInitialState } from "@/game/state/game";
import { instantiatePattern } from "@/data/targets";
import { reconcileTargets } from "@/game/rules/targets";
import { makePung, makeKong } from "@/game/tiles";
import { emptyBoard, loose } from "./helpers";
import type { GameState } from "@/types";

function stateWith(patch: Partial<GameState>): GameState {
  return { ...createInitialState(1), ...patch };
}

describe("evaluateHandSolvability", () => {
  it("an easy opener is solvable from a fresh board", () => {
    const s = createInitialState(42);
    const r = evaluateHandSolvability(s, s.target, s.wall);
    expect(r.solvable).toBe(true);
    expect(r.missingRequirements).toHaveLength(0);
  });

  it("flags a Kong hand as unsolvable before Kongs unlock", () => {
    const target = instantiatePattern("KONGCALL"); // requires a number-kong
    const early = stateWith({ round: 1, learning: undefined, target });
    const r = evaluateHandSolvability(early, target, early.wall);
    expect(r.solvable).toBe(false);
    expect(r.blockingReasons.some((b) => /Kong/i.test(b))).toBe(true);
  });

  it("accepts the same Kong hand once the advanced round is reached", () => {
    const target = instantiatePattern("KONGCALL");
    const late = stateWith({ round: 8, learning: undefined, target });
    const r = evaluateHandSolvability(late, target, late.wall);
    expect(r.solvable).toBe(true);
  });

  it("flags a dead-end board (full, no move, hand not done)", () => {
    // A full board of alternating non-combining tiles with no legal move.
    const board = emptyBoard();
    const types = ["dot-1", "bam-2", "crak-3", "dragon-red"] as const;
    for (let i = 0; i < 16; i++) {
      // Ensure no two orthogonal neighbours ever match/combine.
      const r = Math.floor(i / 4);
      const c = i % 4;
      board[i] = loose(types[(r + c) % 4], `x${i}`);
    }
    const target = instantiatePattern("OPEN");
    const s = stateWith({ board, target, round: 1 });
    const r = evaluateHandSolvability(s, target, []);
    expect(r.solvable).toBe(false);
    expect(r.blockingReasons.some((b) => /no legal move/i.test(b))).toBe(true);
  });

  it("reports required tiles for an unfilled requirement", () => {
    const board = emptyBoard();
    board[0] = loose("dot-2", "a"); // one toward a pung of dot-2
    const target = instantiatePattern("TWINS");
    const rec = reconcileTargets(target, board);
    const s = stateWith({ board: rec.board, target: rec.target, round: 3 });
    // Judged against a full wall, the hand is buildable and still-needed tiles
    // are reported.
    const r = evaluateHandSolvability(s, rec.target, s.wall);
    expect(r.solvable).toBe(true);
    expect(Object.keys(r.requiredTileCounts).length).toBeGreaterThan(0);
  });

  it("steers toward the tile a near-complete set needs", () => {
    // A pung of dot-2 is on the board; the KONGCALL hand wants a kong. The
    // steer should point at dot-2 (extend the pung → kong).
    const board = emptyBoard();
    board[5] = makePung({ suit: "dot", rank: 2 }, false, "pung");
    const target = instantiatePattern("KONGCALL");
    const rec = reconcileTargets(target, board);
    const s = stateWith({ board: rec.board, target: rec.target, round: 8 });
    const steer = steerTypeForTarget(s, rec.target);
    expect(steer).toBe("dot-2");
  });

  it("a completed Kong satisfies a number-kong requirement", () => {
    const board = emptyBoard();
    board[0] = makeKong({ suit: "bam", rank: 1 }, false, "k");
    const target = instantiatePattern("KONGCALL");
    const rec = reconcileTargets(target, board);
    expect(rec.target.requirements.some((r) => r.kind === "number-kong" && r.filledBy === "k")).toBe(true);
  });
});
