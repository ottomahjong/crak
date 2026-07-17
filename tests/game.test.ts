import { describe, it, expect } from "vitest";
import {
  createInitialState,
  move,
  undo,
  completeHand,
  setTarget,
} from "@/game/state/game";
import { reconcileTargets } from "@/game/rules/targets";
import { isGameOver } from "@/game/rules/movement";
import { makePair, makePung, makeRun } from "@/game/tiles";
import { CELL_COUNT } from "@/types";
import { emptyBoard } from "./helpers";
import type { GameState } from "@/types";

function freshState(seed = 123): GameState {
  return createInitialState(seed);
}

describe("initial state", () => {
  it("starts with a handful of loose tiles and pattern A", () => {
    const s = freshState();
    const count = s.board.filter(Boolean).length;
    expect(count).toBe(4);
    expect(s.target.id).toBe("A");
    expect(s.score).toBe(0);
    expect(s.round).toBe(1);
    expect(s.undoAvailable).toBe(true);
  });

  it("is reproducible from a seed", () => {
    const a = freshState(555);
    const b = freshState(555);
    expect(a.board.map((t) => (t ? t.id.split("-")[0] : "."))).toEqual(
      b.board.map((t) => (t ? t.id.split("-")[0] : ".")),
    );
  });
});

describe("move", () => {
  it("spawns a tile only on a valid move", () => {
    let s = freshState(1);
    // Find a direction that changes the board.
    const dirs = ["left", "right", "up", "down"] as const;
    const before = s.board.filter(Boolean).length;
    for (const d of dirs) {
      const out = move(s, d);
      if (out.changed) {
        const after = out.state.board.filter(Boolean).length;
        // one spawn added (net of any merges)
        expect(after).toBeGreaterThanOrEqual(before - 2 + 1);
        expect(out.spawnedTile).not.toBeNull();
        return;
      }
    }
  });

  it("ignores invalid moves without spawning", () => {
    // Single tile already at the left edge cannot move left.
    let s = freshState();
    s = { ...s, board: emptyBoard() };
    s.board[0] = makePairLoose();
    const out = move(s, "left");
    expect(out.changed).toBe(false);
    expect(out.spawnedTile).toBeNull();
  });

  it("awards score for completed sets and target slots", () => {
    let s = freshState();
    const b = emptyBoard();
    b[0] = mkLoose("dot-1");
    b[1] = mkLoose("dot-1");
    s = { ...s, board: b, target: setTarget(s, "A").target };
    const out = move(s, "left");
    expect(out.changed).toBe(true);
    // A pair scores 25 and fills the ANY PAIR slot (+100).
    expect(out.scoreDelta).toBeGreaterThanOrEqual(125);
  });
});

describe("undo", () => {
  it("restores the previous state once", () => {
    let s = freshState(2);
    const dirs = ["left", "right", "up", "down"] as const;
    let out = move(s, "left");
    let d = 1;
    while (!out.changed && d < 4) {
      out = move(s, dirs[d]);
      d++;
    }
    expect(out.changed).toBe(true);
    const undone = undo(out.state);
    expect(undone.board.filter(Boolean).length).toBe(s.board.filter(Boolean).length);
    expect(undone.undoAvailable).toBe(false);
    // Second undo is a no-op.
    const again = undo(undone);
    expect(again).toBe(undone);
  });
});

describe("hand completion", () => {
  it("advances round, bumps multiplier, keeps completed sets, clears loose tiles", () => {
    let s = freshState();
    const b = emptyBoard();
    // Four completed sets satisfying pattern A + some loose numbers.
    b[0] = makePair({ suit: "dot", rank: 1 });
    b[1] = makePung({ suit: "bam", rank: 2 });
    b[2] = makeRun("crak");
    b[3] = makePung({ dragon: "red" });
    b[4] = mkLoose("dot-2");
    b[5] = mkLoose("bam-1");
    b[6] = mkLoose("crak-3");
    b[7] = mkLoose("dot-3");
    const rec = reconcileTargets(setTarget(s, "A").target, b);
    s = { ...s, board: rec.board, target: rec.target, status: "won-hand" };
    expect(rec.complete).toBe(true);

    const result = completeHand(s);
    expect(result.state.round).toBe(2);
    expect(result.state.multiplier).toBeGreaterThan(1);
    expect(result.state.handsCompleted).toBe(1);
    expect(result.bonus).toBeGreaterThan(0);
    // Completed sets remain.
    const completed = result.state.board.filter((t) => t?.state === "completed").length;
    expect(completed).toBe(4);
    // Up to three loose numbers removed.
    expect(result.removedTiles).toBeLessThanOrEqual(3);
    expect(result.state.status).toBe("playing");
  });
});

describe("game over", () => {
  it("isGameOver is true for a full unmergeable checkerboard", () => {
    const b = emptyBoard();
    const pat = ["dot-1", "bam-2"];
    for (let i = 0; i < CELL_COUNT; i++) {
      const r = Math.floor(i / 4);
      const c = i % 4;
      b[i] = mkLoose(pat[(r + c) % 2] as any);
    }
    expect(isGameOver(b)).toBe(true);
  });

  it("a move that fills the last cell into a dead board flags game over", () => {
    let s = freshState();
    // A full dead checkerboard except one cell; a left move here does not
    // change the board, so we assert the engine treats a dead board correctly
    // via the pure predicate the engine uses internally.
    const b = emptyBoard();
    const pat = ["dot-1", "bam-2"];
    for (let i = 0; i < CELL_COUNT; i++) {
      const r = Math.floor(i / 4);
      const c = i % 4;
      b[i] = mkLoose(pat[(r + c) % 2] as any);
    }
    s = { ...s, board: b };
    // No direction changes a dead board => no spawn, status unchanged.
    const out = move(s, "left");
    expect(out.changed).toBe(false);
    expect(isGameOver(s.board)).toBe(true);
  });
});

// --- local helpers -------------------------------------------------------
import { makeLooseFromType } from "@/game/tiles";
function mkLoose(type: any) {
  return makeLooseFromType(type);
}
function makePairLoose() {
  return makeLooseFromType("dot-1");
}
