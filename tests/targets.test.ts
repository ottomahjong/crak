import { describe, it, expect } from "vitest";
import { reconcileTargets, matchesRequirement } from "@/game/rules/targets";
import { instantiatePattern, pickPatternForRound, patternDifficulty } from "@/data/targets";
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
    const pattern = instantiatePattern("LADDER"); // DOT/BAM/CRAK RUN + ANY PAIR
    const dotRunReq = pattern.requirements.find((r) => r.suit === "dot")!;
    expect(matchesRequirement(dotRunReq, makeRun("dot"))).toBe(true);
    expect(matchesRequirement(dotRunReq, makeRun("bam"))).toBe(false);
  });

  it("dragon-set matches dragon pair or pung", () => {
    const pattern = instantiatePattern("GATE");
    const req = pattern.requirements.find((r) => r.kind === "dragon-set")!;
    expect(matchesRequirement(req, makePair({ dragon: "red" }))).toBe(true);
    expect(matchesRequirement(req, makePung({ dragon: "green" }))).toBe(true);
    expect(matchesRequirement(req, makePung({ suit: "dot", rank: 1 }))).toBe(false);
  });

  it("any-set matches a pung or a run but not a pair", () => {
    const pattern = instantiatePattern("OPEN");
    const req = pattern.requirements.find((r) => r.kind === "any-set")!;
    expect(matchesRequirement(req, makePung({ suit: "dot", rank: 1 }))).toBe(true);
    expect(matchesRequirement(req, makeRun("bam"))).toBe(true);
    expect(matchesRequirement(req, makePair({ suit: "dot", rank: 1 }))).toBe(false);
  });
});

describe("reconcile", () => {
  it("fills slots most-specific-first", () => {
    const pattern = instantiatePattern("LADDER"); // needs a DOT RUN
    const board = boardWith(makeRun("dot"), makePair({ suit: "bam", rank: 2 }));
    const res = reconcileTargets(pattern, board);
    const dotReq = res.target.requirements.find((r) => r.suit === "dot")!;
    const pairReq = res.target.requirements.find((r) => r.kind === "any-pair")!;
    expect(dotReq.filledBy).toBeTruthy(); // dot run claimed by DOT RUN slot
    expect(pairReq.filledBy).toBeTruthy();
    expect(res.complete).toBe(false);
  });

  it("marks tiles usedForTarget and never double-counts", () => {
    const pattern = instantiatePattern("TWINS"); // two number pungs
    const pung = makePung({ suit: "dot", rank: 1 });
    const board = boardWith(pung);
    const res = reconcileTargets(pattern, board);
    const filled = res.target.requirements.filter((r) => r.filledBy === pung.id);
    expect(filled).toHaveLength(1); // one pung fills exactly one slot
    expect(res.board[0]!.usedForTarget).toBe(true);
  });

  it("reports complete when all four slots fill", () => {
    const pattern = instantiatePattern("GATERUN"); // pair + pung + run + dragon
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
    const pattern = instantiatePattern("GATE");
    const pung = makePung({ dragon: "red" });
    const board = boardWith(pung);
    const first = reconcileTargets(pattern, board);
    const req = first.target.requirements.find((r) => r.kind === "dragon-set")!;
    const second = reconcileTargets(first.target, first.board);
    const req2 = second.target.requirements.find((r) => r.kind === "dragon-set")!;
    expect(req2.filledBy).toBe(req.filledBy);
  });
});

describe("difficulty ramp", () => {
  it("round 1 always deals an easy (difficulty 1) hand", () => {
    for (let seed = 1; seed < 40; seed++) {
      const { pattern } = pickPatternForRound(1, "SUITS", seed * 101);
      expect(patternDifficulty(pattern.id)).toBe(1);
    }
  });

  it("rounds 2-3 never deal a hard (difficulty 3) hand", () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = pickPatternForRound(2, "OPEN", seed * 313);
      const b = pickPatternForRound(3, "OPEN", seed * 977);
      expect(patternDifficulty(a.pattern.id)).toBeLessThanOrEqual(2);
      expect(patternDifficulty(b.pattern.id)).toBeLessThanOrEqual(2);
    }
  });

  it("does not immediately repeat the previous pattern", () => {
    for (let seed = 1; seed < 40; seed++) {
      const { pattern } = pickPatternForRound(6, "GATE", seed * 555);
      expect(pattern.id).not.toBe("GATE");
    }
  });
});
