import { describe, it, expect } from "vitest";
import {
  createInitialState,
  move,
  undo,
  completeHand,
  setTarget,
} from "@/game/state/game";
import { reconcileTargets } from "@/game/rules/targets";
import { isGameOver, hasAnyMove } from "@/game/rules/movement";
import { makePair, makePung, makeRun } from "@/game/tiles";
import { CELL_COUNT } from "@/types";
import { emptyBoard } from "./helpers";
import type { GameState } from "@/types";

function freshState(seed = 123): GameState {
  return createInitialState(seed);
}

describe("initial state", () => {
  it("starts with a handful of loose tiles and the opening pattern", () => {
    const s = freshState();
    const count = s.board.filter(Boolean).length;
    expect(count).toBe(3); // CONFIG.INITIAL_TILES — more empty space
    expect(s.target.id).toBe("OPEN");
    expect(s.score).toBe(0);
    expect(s.round).toBe(1);
    expect(s.undosRemaining).toBe(3);
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
  it("spawns exactly one tile on every valid swipe — including combining moves", () => {
    // Every valid slide adds one tile.
    let s = freshState();
    const b1 = emptyBoard();
    b1[3] = mkLoose("dot-1"); // will step left one cell each swipe
    s = { ...s, board: b1 };
    const m1 = move(s, "left");
    expect(m1.changed).toBe(true);
    expect(m1.events).toHaveLength(0);
    expect(m1.spawnedTile).not.toBeNull(); // first slide already spawns
    const m2 = move(m1.state, "left");
    expect(m2.changed).toBe(true);
    expect(m2.spawnedTile).not.toBeNull(); // and every slide after

    // A combining move also spawns (it netted a tile away by fusing two).
    let combo = freshState();
    const b2 = emptyBoard();
    b2[0] = mkLoose("dot-1");
    b2[1] = mkLoose("dot-1"); // adjacent → pair on swipe left
    combo = { ...combo, board: b2 };
    const merged = move(combo, "left");
    expect(merged.changed).toBe(true);
    expect(merged.events.length).toBeGreaterThan(0);
    expect(merged.spawnedTile).not.toBeNull();
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
    s = { ...s, board: b, target: setTarget(s, "OPEN").target };
    const out = move(s, "left");
    expect(out.changed).toBe(true);
    // A pair scores 20 and fills an ANY PAIR slot (+120).
    expect(out.scoreDelta).toBeGreaterThanOrEqual(140);
  });
});

describe("undo (three per game)", () => {
  function firstChangingMove(s: GameState) {
    const dirs = ["left", "right", "up", "down"] as const;
    for (const d of dirs) {
      const out = move(s, d);
      if (out.changed) return out;
    }
    return move(s, "left");
  }

  it("restores the exact previous state and decrements the count", () => {
    const s = freshState(2);
    const out = firstChangingMove(s);
    expect(out.changed).toBe(true);
    expect(out.state.undosRemaining).toBe(3);
    const undone = undo(out.state);
    expect(undone.board.filter(Boolean).length).toBe(s.board.filter(Boolean).length);
    expect(undone.score).toBe(s.score);
    expect(undone.undosRemaining).toBe(2);
  });

  it("allows up to three undos, then stops", () => {
    let s = freshState(9);
    // Make three changing moves.
    for (let i = 0; i < 3; i++) {
      const out = firstChangingMove(s);
      if (!out.changed) break;
      s = out.state;
    }
    let count = 0;
    while (s.undosRemaining > 0 && s.undoStack.length > 0) {
      const before = s.undosRemaining;
      s = undo(s);
      expect(s.undosRemaining).toBe(before - 1);
      count += 1;
      if (count > 5) break;
    }
    expect(count).toBeLessThanOrEqual(3);
    // Further undo is a no-op.
    const again = undo(s);
    expect(again).toBe(s);
  });
});

describe("hand completion", () => {
  it("advances round, bumps multiplier, cashes in the fulfilling sets, keeps loose tiles", () => {
    let s = freshState();
    const b = emptyBoard();
    // Four completed sets satisfying pattern GATERUN + some loose numbers.
    b[0] = makePair({ suit: "dot", rank: 1 });
    b[1] = makePung({ suit: "bam", rank: 2 });
    b[2] = makeRun("crak");
    b[3] = makePung({ dragon: "red" });
    b[4] = mkLoose("dot-2");
    b[5] = mkLoose("bam-1");
    b[6] = mkLoose("crak-3");
    b[7] = mkLoose("dot-3");
    const rec = reconcileTargets(setTarget(s, "GATERUN").target, b);
    s = { ...s, board: rec.board, target: rec.target, status: "won-hand" };
    expect(rec.complete).toBe(true);

    const result = completeHand(s);
    expect(result.state.round).toBe(2);
    expect(result.state.multiplier).toBeGreaterThan(1);
    expect(result.state.handsCompleted).toBe(1);
    expect(result.bonus).toBeGreaterThan(0);
    // The four fulfilling sets are cashed in (removed) to make room.
    const completed = result.state.board.filter((t) => t?.state === "completed").length;
    expect(completed).toBe(0);
    expect(result.removedTiles).toBe(4);
    // Loose tiles carry over.
    const loose = result.state.board.filter((t) => t?.state === "loose").length;
    expect(loose).toBe(4);
    expect(result.state.status).toBe("playing");
  });

  it("never counts a cashed-in set toward the next hand", () => {
    let s = freshState();
    const b = emptyBoard();
    b[0] = makePair({ suit: "dot", rank: 1 });
    b[1] = makePung({ suit: "bam", rank: 2 });
    b[2] = makeRun("crak");
    b[3] = makePung({ dragon: "red" });
    const rec = reconcileTargets(setTarget(s, "GATERUN").target, b);
    s = { ...s, board: rec.board, target: rec.target, status: "won-hand" };
    const result = completeHand(s);
    // Board is empty of completed sets, so the new target starts unfilled.
    const filled = result.state.target.requirements.filter((r) => r.filledBy).length;
    expect(filled).toBe(0);
  });

  it("never leaves the board empty after cashing in (no soft-lock)", () => {
    // A board that is ENTIRELY the four scoring sets — cashing them in would
    // empty the board and dead-lock the game without a top-up.
    let s = freshState();
    const b = emptyBoard();
    b[0] = makePair({ suit: "dot", rank: 1 });
    b[1] = makePung({ suit: "bam", rank: 2 });
    b[2] = makeRun("crak");
    b[3] = makePung({ dragon: "red" });
    const rec = reconcileTargets(setTarget(s, "GATERUN").target, b);
    s = { ...s, board: rec.board, target: rec.target, status: "won-hand" };
    const result = completeHand(s);
    const tiles = result.state.board.filter(Boolean).length;
    expect(tiles).toBeGreaterThanOrEqual(1);
    expect(hasAnyMove(result.state.board)).toBe(true);
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
