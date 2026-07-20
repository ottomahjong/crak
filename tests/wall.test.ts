import { describe, it, expect } from "vitest";
import { createInitialState, move } from "@/game/state/game";
import { chooseMove } from "./sim/harness";
import { wallSize, PRIMARY_WALL } from "@/game/inventory";
import type { Direction } from "@/types";

const DIRS: Direction[] = ["up", "down", "left", "right"];

describe("finite wall in play", () => {
  it("the primary wall is finite and matches its configured size", () => {
    const s = createInitialState(1);
    // Initial deal came out of the wall, so remaining < start.
    expect(s.wallStart).toBe(wallSize(PRIMARY_WALL));
    expect(s.wall.length).toBeLessThan(s.wallStart);
    expect(s.wall.length).toBeGreaterThan(0);
  });

  it("never draws more tiles than the wall holds (conservation)", () => {
    let s = createInitialState(4242);
    const initialTiles = s.board.filter(Boolean).length;
    let spawns = 0;
    for (let i = 0; i < 4000; i++) {
      if (s.status !== "playing") break;
      const dir = chooseMove(s) ?? DIRS[i % 4];
      const out = move(s, dir);
      if (!out.changed) break;
      if (out.spawnedTile) spawns++;
      s = out.state;
      // The wall can only shrink (primary wall never reshuffles).
      expect(s.wall.length).toBeGreaterThanOrEqual(0);
    }
    // Every tile that entered the board was one draw removed from the wall.
    expect(initialTiles + spawns).toBe(s.wallStart - s.wall.length);
  });

  it("a finite game ends — it does not run forever", () => {
    let s = createInitialState(777);
    let moves = 0;
    for (; moves < 3000; moves++) {
      if (s.status !== "playing") break;
      const dir = chooseMove(s);
      if (!dir) break;
      const out = move(s, dir);
      if (!out.changed) break;
      s = out.state;
      // Once every hand-completion cadence, allow the run to progress.
      if (s.status === "won-hand") {
        // A won hand is a legitimate stopping point for this bound.
        break;
      }
    }
    // With a finite wall the run cannot go on indefinitely.
    expect(moves).toBeLessThan(3000);
  });

  it("stops spawning once the wall is spent", () => {
    // Drain a game to a spent wall, then confirm no further spawn appears.
    let s = createInitialState(2024);
    let sawEmptyWallMove = false;
    for (let i = 0; i < 4000 && s.status === "playing"; i++) {
      const dir = chooseMove(s) ?? DIRS[i % 4];
      const out = move(s, dir);
      if (!out.changed) break;
      if (s.wall.length === 0 && out.spawnedTile) {
        // Drawing from an empty, non-reshuffling wall must never yield a tile.
        sawEmptyWallMove = true;
      }
      s = out.state;
    }
    expect(sawEmptyWallMove).toBe(false);
  });
});
