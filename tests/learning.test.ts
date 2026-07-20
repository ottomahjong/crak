import { describe, it, expect } from "vitest";
import {
  createInitialState,
  move,
  completeHand,
  learningPool,
  ruleOptsFor,
} from "@/game/state/game";
import { entryEdgeFor, entryLinesFor } from "@/game/rules/movement";
import { computeHint } from "@/game/hints";
import { applyMove } from "@/game/rules/movement";
import { tryCombine } from "@/game/rules/combine";
import { tileTypeOf } from "@/game/tiles";
import type { Direction, GameState, TileTypeId } from "@/types";
import { reconcileTargets } from "@/game/rules/targets";

describe("edge spawning", () => {
  it("enters from the edge opposite the swipe", () => {
    expect(entryEdgeFor("left")).toBe("right");
    expect(entryEdgeFor("right")).toBe("left");
    expect(entryEdgeFor("up")).toBe("down");
    expect(entryEdgeFor("down")).toBe("up");
  });

  it("entry lines start at the correct edge and walk inward", () => {
    // swipe left → enter at right column (col 3), depth 0.
    expect(entryLinesFor("left")[0]).toEqual([3, 7, 11, 15]);
    // swipe up → enter at bottom row (row 3), depth 0.
    expect(entryLinesFor("up")[0]).toEqual([12, 13, 14, 15]);
  });

  it("a spawning swipe enters from the opposite edge", () => {
    // Learning hand 2 (dots+bams); craft a pure slide, drive past the cadence.
    let s = createInitialState(42, 2);
    const board = new Array(16).fill(null);
    board[3] = { id: "a", state: "loose", suit: "dot", rank: 1 }; // steps left
    s = { ...s, board, movesSinceSpawn: 99 }; // force a spawn on the next slide
    const out = move(s, "left");
    expect(out.changed).toBe(true);
    expect(out.spawnedTile).not.toBeNull();
    expect(out.spawnEntry).toBe("right");
    // The spawned tile must be on the right column (indices 3,7,11,15).
    const idx = out.state.board.findIndex((t) => t?.id === out.spawnedTile!.id);
    expect([3, 7, 11, 15]).toContain(idx);
  });

  it("spawn is skipped on a combining move (no overlap with a merge)", () => {
    let s = createInitialState(7, 1);
    const board = new Array(16).fill(null);
    board[0] = { id: "a", state: "loose", suit: "dot", rank: 1 };
    board[1] = { id: "b", state: "loose", suit: "dot", rank: 1 };
    s = { ...s, board };
    const out = move(s, "left");
    expect(out.events.length).toBeGreaterThan(0);
    expect(out.spawnedTile).toBeNull();
    expect(out.spawnEntry).toBeNull();
  });
});

describe("learning tile pools", () => {
  const only = (s: Set<TileTypeId> | undefined) => (s ? [...s].sort() : undefined);

  it("restricts each hand's families", () => {
    expect(only(learningPool(1))).toEqual(["dot-1", "dot-2", "dot-3"]);
    expect(only(learningPool(2))).toContain("bam-1");
    expect(only(learningPool(2))).not.toContain("dragon-red");
    expect(only(learningPool(3))).toContain("dragon-red");
    expect(only(learningPool(3))).not.toContain("joker");
    expect(only(learningPool(4))).toContain("joker");
    expect(learningPool(undefined)).toBeUndefined();
  });

  it("hand 1 spawns only dots, never dragons or jokers", () => {
    let s = createInitialState(123, 1);
    const seen = new Set<TileTypeId>();
    for (let i = 0; i < 40; i++) {
      // alternate directions to force many non-combining slides → spawns
      const dir = (["up", "down", "left", "right"] as Direction[])[i % 4];
      const out = move(s, dir);
      if (out.spawnedTile) seen.add(tileTypeOf(out.spawnedTile)!);
      if (out.state.status === "won-hand") s = completeHand(out.state).state;
      else s = out.state;
      if (s.learning !== 1) break; // stop once we advance
    }
    for (const t of seen) expect(["dot-1", "dot-2", "dot-3"]).toContain(t);
  });

  it("hand 1 disables runs (no partial runs)", () => {
    const s = createInitialState(1, 1);
    expect(ruleOptsFor(s).runs).toBe(false);
    const board = new Array(16).fill(null);
    board[0] = { id: "a", state: "loose", suit: "dot", rank: 1 };
    board[1] = { id: "b", state: "loose", suit: "dot", rank: 2 };
    const res = applyMove(board, "left", ruleOptsFor(s));
    expect(res.events).toHaveLength(0); // 1+2 slide past, no partial
  });

  it("hand 1 reaches a first pair in two one-step swipes", () => {
    const s = createInitialState(999, 1);
    // Two 1-dots two cells apart: swipe once to bring them adjacent, again to pair.
    const first = move(s, "left");
    expect(first.events.some((e) => e.type === "pair")).toBe(false);
    const second = move(first.state, "left");
    expect(second.events.some((e) => e.type === "pair")).toBe(true);
  });
});

describe("learning progression", () => {
  function completeLearningHand(stage: 1 | 2 | 3 | 4): GameState {
    // Build a board that satisfies the stage's pattern, then completeHand.
    let s = createInitialState(5, stage);
    const b: GameState["board"] = new Array(16).fill(null);
    // pair + pung always satisfy hand 1 & are a subset elsewhere; add per stage.
    b[0] = { id: "pair", state: "completed", setKind: "pair", suit: "dot", rank: 1 };
    b[1] = { id: "pung", state: "completed", setKind: "pung", suit: "dot", rank: 2 };
    if (stage >= 2) b[2] = { id: "run", state: "completed", setKind: "run", suit: "bam" };
    if (stage >= 3) b[3] = { id: "drg", state: "completed", setKind: "pung", dragon: "red" };
    if (stage === 4) b[4] = { id: "run2", state: "completed", setKind: "run", suit: "dot" };
    const rec = reconcileTargets(s.target, b);
    s = { ...s, board: rec.board, target: rec.target };
    return s;
  }

  it("advances hand by hand and unlocks endless after hand 4", () => {
    let s = completeLearningHand(1);
    let r = completeHand(s);
    expect(r.state.learning).toBe(2);
    expect(r.learningAdvance?.nextStage).toBe(2);

    s = completeLearningHand(4);
    r = completeHand(s);
    expect(r.state.learning).toBeUndefined(); // endless mode
    expect(r.learningAdvance?.nextStage).toBeNull();
    expect(r.state.round).toBe(1);
  });
});

describe("guided hints legality", () => {
  it("never suggests a combination that is not legal", () => {
    for (let seed = 1; seed < 60; seed++) {
      let s = createInitialState(seed * 131);
      for (let m = 0; m < 12; m++) {
        const hint = computeHint(s);
        if (hint.ids.length === 2) {
          const [x, y] = hint.ids;
          const tx = s.board.find((t) => t?.id === x)!;
          const ty = s.board.find((t) => t?.id === y)!;
          // The two hinted tiles must be able to combine under the rules.
          const legal = pairCanCombine(tx, ty);
          expect(legal, `seed ${seed}: ${x}+${y}`).toBe(true);
        }
        const dirs: Direction[] = ["left", "up", "right", "down"];
        const out = move(s, dirs[m % 4]);
        if (out.state.status === "won-hand") s = completeHand(out.state).state;
        else s = out.state;
        if (out.state.status === "game-over") break;
      }
    }
  });
});

// A hint is legal iff the two tiles can combine (in either role) under the
// one-step collision primitive.
function pairCanCombine(a: import("@/types").Tile, b: import("@/types").Tile): boolean {
  return tryCombine(a, b) !== null || tryCombine(b, a) !== null;
}
