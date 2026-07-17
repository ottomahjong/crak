import { describe, it, expect } from "vitest";
import { buildBag, drawTile, relevantTypes } from "@/game/generator";
import { instantiatePattern } from "@/data/targets";

describe("fair bag", () => {
  it("builds a non-empty shuffled bag", () => {
    const target = instantiatePattern("A");
    const { bag } = buildBag(target, 12345);
    expect(bag.length).toBeGreaterThan(15);
    expect(bag).toContain("joker");
  });

  it("weights the bag toward the target's suit", () => {
    const target = instantiatePattern("B"); // DOT/BAM/CRAK sets
    const { bag } = buildBag(target, 999);
    const dots = bag.filter((t) => t.startsWith("dot-")).length;
    // Base is 2 of each; weighting adds another copy of dot ranks.
    expect(dots).toBeGreaterThanOrEqual(9);
  });

  it("is deterministic for a fixed seed", () => {
    const target = instantiatePattern("A");
    const a = buildBag(target, 42);
    const b = buildBag(target, 42);
    expect(a.bag).toEqual(b.bag);
  });

  it("draws until empty then refills", () => {
    const target = instantiatePattern("A");
    let state = { ...buildBag(target, 7), recentSpawns: [] as any };
    const first = state.bag.length;
    for (let i = 0; i < first; i++) {
      const d = drawTile(state, target);
      state = { bag: d.bag, rngState: d.rngState, recentSpawns: d.recentSpawns };
    }
    expect(state.bag.length).toBe(0);
    const refill = drawTile(state, target);
    expect(refill.bag.length).toBeGreaterThan(0);
  });

  it("avoids more than three identical consecutive spawns", () => {
    const target = instantiatePattern("A");
    let state = {
      bag: ["dot-1", "dot-1", "dot-1", "dot-1", "dot-1", "bam-2"] as any[],
      rngState: 5,
      recentSpawns: ["dot-1", "dot-1", "dot-1"] as any[],
    };
    const draw = drawTile(state as any, target);
    // Already 3 dot-1 trailing; the guard should avoid a 4th.
    expect(draw.type).not.toBe("dot-1");
  });

  it("relevantTypes includes needed suit and joker", () => {
    const target = instantiatePattern("B");
    const rel = relevantTypes(target);
    expect(rel.has("dot-1")).toBe(true);
    expect(rel.has("joker")).toBe(true);
  });
});
