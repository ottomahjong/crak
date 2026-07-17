import { describe, it, expect } from "vitest";
import { reconcileTargets, matchesRequirement } from "@/game/rules/targets";
import { instantiatePattern } from "@/data/targets";
import { makePair, makePung, makeRun } from "@/game/tiles";
import { emptyBoard } from "./helpers";
import type { Board } from "@/types";

function boardWith(...tiles: ReturnType<typeof makePair>[]): Board {
  const b = emptyBoard();
  tiles.forEach((t, i) => (b[i] = t));
  return b;
}

describe("requirement matching", () => {
  it("suit-run matches only the right suit run", () => {
    const pattern = instantiatePattern("D"); // DOT/BAM/CRAK RUN + ANY PAIR
    const dotRunReq = pattern.requirements.find((r) => r.suit === "dot")!;
    expect(matchesRequirement(dotRunReq, makeRun("dot"))).toBe(true);
    expect(matchesRequirement(dotRunReq, makeRun("bam"))).toBe(false);
  });

  it("dragon-set matches dragon pair or pung", () => {
    const pattern = instantiatePattern("A");
    const req = pattern.requirements.find((r) => r.kind === "dragon-set")!;
    expect(matchesRequirement(req, makePair({ dragon: "red" }))).toBe(true);
    expect(matchesRequirement(req, makePung({ dragon: "green" }))).toBe(true);
    expect(matchesRequirement(req, makePung({ suit: "dot", rank: 1 }))).toBe(false);
  });
});

describe("reconcile", () => {
  it("fills slots most-specific-first", () => {
    const pattern = instantiatePattern("D"); // needs a DOT RUN
    const board = boardWith(makeRun("dot"), makePair({ suit: "bam", rank: 2 }));
    const res = reconcileTargets(pattern, board);
    const dotReq = res.target.requirements.find((r) => r.suit === "dot")!;
    const pairReq = res.target.requirements.find((r) => r.kind === "any-pair")!;
    expect(dotReq.filledBy).toBeTruthy(); // dot run claimed by DOT RUN slot
    expect(pairReq.filledBy).toBeTruthy();
    expect(res.complete).toBe(false);
  });

  it("marks tiles usedForTarget and never double-counts", () => {
    const pattern = instantiatePattern("C"); // two number pungs
    const pung = makePung({ suit: "dot", rank: 1 });
    const board = boardWith(pung);
    const res = reconcileTargets(pattern, board);
    const filled = res.target.requirements.filter((r) => r.filledBy === pung.id);
    expect(filled).toHaveLength(1); // one pung fills exactly one slot
    expect(res.board[0]!.usedForTarget).toBe(true);
  });

  it("reports complete when all four slots fill", () => {
    const pattern = instantiatePattern("A");
    const board = boardWith(
      makePair({ suit: "dot", rank: 1 }),
      makePung({ suit: "bam", rank: 2 }),
      makeRun("crak"),
      makePung({ dragon: "red" }),
    );
    const res = reconcileTargets(pattern, board);
    expect(res.complete).toBe(true);
    expect(res.newlyFilled).toHaveLength(4);
  });

  it("keeps existing assignment stable across reconciles", () => {
    const pattern = instantiatePattern("A");
    const pung = makePung({ dragon: "red" });
    const board = boardWith(pung);
    const first = reconcileTargets(pattern, board);
    const req = first.target.requirements.find((r) => r.kind === "dragon-set")!;
    const second = reconcileTargets(first.target, first.board);
    const req2 = second.target.requirements.find((r) => r.kind === "dragon-set")!;
    expect(req2.filledBy).toBe(req.filledBy);
  });
});
