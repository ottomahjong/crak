import { describe, it, expect } from "vitest";
import { applyMove, hasAnyMove, canMove } from "@/game/rules/movement";
import { boardFrom, describeBoard, emptyBoard, loose } from "./helpers";

// ONE SWIPE = ONE STEP. These tests pin the deterministic one-cell model.

describe("one-cell movement", () => {
  it("moves a tile exactly one cell, not to the edge", () => {
    const board = boardFrom([
      [".", ".", "dot-1", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    expect(res.changed).toBe(true);
    // dot-1 was at col 2 → moves to col 1 only.
    expect(describeBoard(res.board)[0]).toEqual([".", "dot-1", ".", "."]);
  });

  it("does not move two cells even across empty space", () => {
    const board = boardFrom([
      [".", ".", ".", "dot-1"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // col 3 → col 2 (one step), NOT col 0.
    expect(describeBoard(res.board)[0]).toEqual([".", ".", "dot-1", "."]);
  });

  it("moves one cell in every direction", () => {
    const mk = () =>
      boardFrom([
        [".", ".", ".", "."],
        [".", "bam-2", ".", "."],
        [".", ".", ".", "."],
        [".", ".", ".", "."],
      ]);
    expect(describeBoard(applyMove(mk(), "left").board)[1][0]).toBe("bam-2");
    expect(describeBoard(applyMove(mk(), "right").board)[1][2]).toBe("bam-2");
    expect(describeBoard(applyMove(mk(), "up").board)[0][1]).toBe("bam-2");
    expect(describeBoard(applyMove(mk(), "down").board)[2][1]).toBe("bam-2");
  });

  it("a tile at the leading edge does not move (no change, no spawn signal)", () => {
    const board = boardFrom([
      ["dot-1", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    expect(res.changed).toBe(false);
    expect(res.events).toHaveLength(0);
  });

  it("a tile blocked by an incompatible neighbour stays put", () => {
    const board = boardFrom([
      ["dot-1", "bam-2", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // dot-1 at edge; bam-2 blocked by incompatible dot-1 → nothing changes.
    expect(res.changed).toBe(false);
    expect(describeBoard(res.board)[0]).toEqual(["dot-1", "bam-2", ".", "."]);
  });

  it("tiles do not compress around one another (each moves one cell)", () => {
    const board = boardFrom([
      [".", "dot-1", "bam-3", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // Both step one cell left, staying adjacent, no combine.
    expect(describeBoard(res.board)[0]).toEqual(["dot-1", "bam-3", ".", "."]);
  });
});

describe("adjacent combining under one-step", () => {
  it("adjacent matching tiles combine when swiped toward the blocked one", () => {
    // Both at the left; swipe left → trailing steps into the edge tile → pair.
    const board = boardFrom([
      ["dot-1", "dot-1", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    expect(res.events[0].type).toBe("pair");
    expect(describeBoard(res.board)[0]).toEqual(["pair:dot1", ".", ".", "."]);
  });

  it("separated matching tiles do NOT combine in one swipe", () => {
    const board = boardFrom([
      ["dot-1", ".", "dot-1", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // The right dot-1 steps one cell closer (col2→col1); no combine yet.
    expect(res.events).toHaveLength(0);
    expect(describeBoard(res.board)[0]).toEqual(["dot-1", "dot-1", ".", "."]);
  });

  it("a pair + adjacent matching tile becomes a pung in one swipe", () => {
    const board = boardFrom([
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    board[0] = { id: "p", state: "completed", setKind: "pair", suit: "dot", rank: 1 };
    board[1] = loose("dot-1", "x");
    const res = applyMove(board, "left");
    expect(res.events[0].type).toBe("pung");
    expect(describeBoard(res.board)[0][0]).toBe("pung:dot1");
  });

  it("no chain: 1,1,1 makes a pair + a loose tile, not a pung", () => {
    const board = boardFrom([
      ["dot-1", "dot-1", "dot-1", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // Leading two → pair; the third steps into the vacated cell, stays loose.
    expect(describeBoard(res.board)[0]).toEqual(["pair:dot1", "dot-1", ".", "."]);
    expect(res.events.filter((e) => e.type === "pair")).toHaveLength(1);
    expect(res.events.filter((e) => e.type === "pung")).toHaveLength(0);
  });

  it("a newly formed pair does not become a pung in the same swipe", () => {
    // pair-forming tiles at the edge + a third right behind: third only steps in.
    const board = boardFrom([
      ["dot-1", "dot-1", "dot-1", "dot-1"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // 0,1 → pair; 2,3 → pair (each pair terminal this swipe).
    const grid = describeBoard(res.board)[0];
    expect(grid[0]).toBe("pair:dot1");
    expect(res.events.every((e) => e.type === "pair")).toBe(true);
  });
});

describe("two-stage runs under one-step", () => {
  it("adjacent 1 and 2 form a partial run", () => {
    const board = boardFrom([
      ["dot-1", "dot-2", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    expect(res.events[0].type).toBe("partial-run");
    expect(describeBoard(res.board)[0][0]).toBe("partial:dot12");
  });

  it("partial 1·2 + adjacent 3 completes a run", () => {
    const board = emptyBoard();
    board[0] = { id: "pr", state: "completed", setKind: "partial", suit: "dot", partRanks: [1, 2] };
    board[1] = loose("dot-3", "three");
    const res = applyMove(board, "left");
    expect(res.events[0].type).toBe("run");
    expect(describeBoard(res.board)[0][0]).toBe("run:dot");
  });

  it("reverse: adjacent 2 and 3 form a partial, then 1 completes it", () => {
    const b1 = boardFrom([
      ["dot-2", "dot-3", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const r1 = applyMove(b1, "left");
    expect(describeBoard(r1.board)[0][0]).toBe("partial:dot23");
    // Now a 1 to the right of the partial, swipe left → run.
    r1.board[1] = loose("dot-1", "one");
    const r2 = applyMove(r1.board, "left");
    expect(r2.events[0].type).toBe("run");
  });
});

describe("move availability + game over", () => {
  it("canMove is direction-specific", () => {
    const board = emptyBoard();
    board[5] = loose("dot-1"); // middle-ish
    expect(canMove(board, "left")).toBe(true);
    expect(canMove(board, "up")).toBe(true);
  });

  it("detects an available one-step move on a busy board", () => {
    const board = boardFrom([
      ["dot-1", "dot-1", ".", "bam-2"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    expect(hasAnyMove(board)).toBe(true);
  });

  it("detects game over: full board, no adjacent combos, nothing can step", () => {
    const board = boardFrom([
      ["dot-1", "bam-2", "dot-1", "bam-2"],
      ["bam-2", "dot-1", "bam-2", "dot-1"],
      ["dot-1", "bam-2", "dot-1", "bam-2"],
      ["bam-2", "dot-1", "bam-2", "dot-1"],
    ]);
    expect(hasAnyMove(board)).toBe(false);
  });
});
