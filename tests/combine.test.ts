import { describe, it, expect } from "vitest";
import { tryCombine } from "@/game/rules/combine";
import { loose } from "./helpers";
import {
  makePair,
  makePartialRun,
  makePung,
} from "@/game/tiles";

// tryCombine(anchor, incoming, opts): the sole pairwise combination primitive
// under one-step movement. The result carries the anchor's id.

describe("tryCombine — pairs & pungs", () => {
  it("two identical numbers → pair (keeps anchor id)", () => {
    const a = loose("dot-1", "anchor");
    const b = loose("dot-1", "in");
    const c = tryCombine(a, b)!;
    expect(c.event).toBe("pair");
    expect(c.tile.setKind).toBe("pair");
    expect(c.tile.id).toBe("anchor");
  });

  it("pair + matching loose → pung", () => {
    const pair = makePair({ suit: "dot", rank: 2 }, false, "pair");
    const c = tryCombine(pair, loose("dot-2"))!;
    expect(c.event).toBe("pung");
    expect(c.tile.setKind).toBe("pung");
  });

  it("two dragons → dragon pair; dragon pair + dragon → dragon pung", () => {
    const dp = tryCombine(loose("dragon-red"), loose("dragon-red"))!;
    expect(dp.event).toBe("dragon-pair");
    const pung = tryCombine(makePair({ dragon: "red" }), loose("dragon-red"))!;
    expect(pung.event).toBe("dragon-pung");
  });

  it("different non-adjacent ranks do not combine", () => {
    expect(tryCombine(loose("dot-1"), loose("dot-3"))).toBeNull();
  });

  it("mixed suits do not combine", () => {
    expect(tryCombine(loose("dot-1"), loose("bam-1"))).toBeNull();
    expect(tryCombine(loose("dot-1"), loose("bam-2"))).toBeNull();
  });
});

describe("tryCombine — two-stage runs", () => {
  it("adjacent ranks → partial run (both orders)", () => {
    expect(tryCombine(loose("bam-1"), loose("bam-2"))!.event).toBe("partial-run");
    expect(tryCombine(loose("dot-3"), loose("dot-2"))!.event).toBe("partial-run");
  });

  it("partial + missing rank → run", () => {
    expect(tryCombine(makePartialRun("bam", [1, 2]), loose("bam-3"))!.event).toBe("run");
    expect(tryCombine(makePartialRun("dot", [2, 3]), loose("dot-1"))!.event).toBe("run");
  });

  it("partial + wrong rank → null", () => {
    expect(tryCombine(makePartialRun("bam", [1, 2]), loose("bam-1"))).toBeNull();
  });

  it("runs disabled (learning hand 1): no partial forms", () => {
    expect(tryCombine(loose("dot-1"), loose("dot-2"), { runs: false })).toBeNull();
  });
});

describe("tryCombine — jokers", () => {
  it("pair + joker → pung (marked usedJoker)", () => {
    const c = tryCombine(makePair({ suit: "dot", rank: 2 }), loose("joker"))!;
    expect(c.event).toBe("pung");
    expect(c.usedJoker).toBe(true);
  });

  it("partial + joker → run", () => {
    const c = tryCombine(makePartialRun("bam", [1, 2]), loose("joker"))!;
    expect(c.event).toBe("run");
    expect(c.usedJoker).toBe(true);
  });

  it("a joker cannot start a pair or a partial", () => {
    expect(tryCombine(loose("dot-1"), loose("joker"))).toBeNull();
    expect(tryCombine(loose("joker"), loose("dot-1"))).toBeNull();
  });

  it("joker + joker never combines", () => {
    expect(tryCombine(loose("joker"), loose("joker"))).toBeNull();
  });

  it("terminal sets never combine further", () => {
    expect(tryCombine(makePung({ suit: "dot", rank: 1 }), loose("dot-1"))).toBeNull();
  });
});
