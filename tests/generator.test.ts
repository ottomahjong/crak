import { describe, it, expect } from "vitest";
import { drawFromWall, relevantTypes } from "@/game/generator";
import { buildWall, wallSize, PRIMARY_WALL, STANDARD_TILE_INVENTORY } from "@/game/inventory";
import { instantiatePattern } from "@/data/targets";
import { emptyBoard } from "./helpers";
import type { TileTypeId } from "@/types";

const FINITE = { ...PRIMARY_WALL, reshuffleWhenEmpty: false };

describe("finite wall", () => {
  it("the canonical wall totals 158 tiles", () => {
    expect(wallSize(STANDARD_TILE_INVENTORY)).toBe(158);
  });

  it("builds the primary wall with exactly the configured copy counts", () => {
    const { wall } = buildWall(PRIMARY_WALL, 12345);
    expect(wall.length).toBe(wallSize(PRIMARY_WALL));
    // 4 copies of each suited tile, no more.
    expect(wall.filter((t) => t === "dot-1").length).toBe(PRIMARY_WALL.suitedCopiesPerTile);
    expect(wall.filter((t) => t === "joker").length).toBe(PRIMARY_WALL.jokerCount);
  });

  it("is deterministic for a fixed seed", () => {
    expect(buildWall(PRIMARY_WALL, 42).wall).toEqual(buildWall(PRIMARY_WALL, 42).wall);
  });

  it("draws down to empty and then stops (finite, no refill)", () => {
    const target = instantiatePattern("OPEN");
    let wall = buildWall(FINITE, 7).wall;
    const start = wall.length;
    let rngState = 7;
    let recentSpawns: TileTypeId[] = [];
    let drawn = 0;
    for (let i = 0; i < start + 5; i++) {
      const d = drawFromWall({
        wall, rngState, recentSpawns, board: emptyBoard(), target,
        cfg: FINITE, reinforceP: 0.7,
      });
      if (!d) break;
      wall = d.wall;
      rngState = d.rngState;
      recentSpawns = d.recentSpawns;
      drawn++;
    }
    expect(drawn).toBe(start); // drew every tile, never one more
    expect(wall.length).toBe(0);
    // A further draw yields nothing — the wall is spent.
    const after = drawFromWall({
      wall, rngState, recentSpawns, board: emptyBoard(), target,
      cfg: FINITE, reinforceP: 0.7,
    });
    expect(after).toBeNull();
  });

  it("a reshuffling wall rebuilds when emptied", () => {
    const target = instantiatePattern("OPEN");
    const cfg = { ...PRIMARY_WALL, reshuffleWhenEmpty: true };
    const d = drawFromWall({
      wall: [], rngState: 3, recentSpawns: [], board: emptyBoard(), target,
      cfg, reinforceP: 0.7,
    });
    expect(d).not.toBeNull();
  });

  it("never draws a tile the wall does not hold", () => {
    const target = instantiatePattern("OPEN");
    // A wall with only two dragon tiles: draws can only be those.
    const d = drawFromWall({
      wall: ["dragon-red", "dragon-green"], rngState: 1, recentSpawns: [],
      board: emptyBoard(), target, cfg: FINITE, reinforceP: 1,
    })!;
    expect(["dragon-red", "dragon-green"]).toContain(d.type);
    expect(d.wall.length).toBe(1);
  });

  it("relevantTypes includes needed suit and joker", () => {
    const target = instantiatePattern("SUITS");
    const rel = relevantTypes(target);
    expect(rel.has("dot-1")).toBe(true);
    expect(rel.has("joker")).toBe(true);
  });
});
