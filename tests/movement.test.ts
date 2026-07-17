import { describe, it, expect } from "vitest";
import { applyMove, hasAnyMove, canMove } from "@/game/rules/movement";
import { boardFrom, describeBoard, emptyBoard, loose } from "./helpers";

describe("basic movement", () => {
  it("slides loose tiles to the leading edge (left)", () => {
    const board = boardFrom([
      [".", ".", ".", "dot-1"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    expect(res.changed).toBe(true);
    expect(describeBoard(res.board)[0]).toEqual(["dot-1", ".", ".", "."]);
  });

  it("slides right", () => {
    const board = boardFrom([
      ["dot-1", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "right");
    expect(describeBoard(res.board)[0]).toEqual([".", ".", ".", "dot-1"]);
  });

  it("slides up and down", () => {
    const board = boardFrom([
      [".", ".", ".", "."],
      [".", "bam-2", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const up = applyMove(board, "up");
    expect(describeBoard(up.board)[0][1]).toBe("bam-2");
    const down = applyMove(board, "down");
    expect(describeBoard(down.board)[3][1]).toBe("bam-2");
  });

  it("reports no change for an invalid move", () => {
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
});

describe("move availability", () => {
  it("detects available move on a full board with adjacent equal tiles", () => {
    const board = boardFrom([
      ["dot-1", "dot-1", "bam-1", "bam-2"],
      ["crak-1", "crak-2", "crak-3", "dot-2"],
      ["bam-3", "dot-3", "crak-1", "bam-1"],
      ["dot-1", "bam-2", "crak-2", "dot-3"],
    ]);
    expect(hasAnyMove(board)).toBe(true);
  });

  it("detects game over on a full board with no combinations or slides", () => {
    // Checkerboard of alternating unmergeable neighbors.
    const board = boardFrom([
      ["dot-1", "bam-2", "dot-1", "bam-2"],
      ["bam-2", "dot-1", "bam-2", "dot-1"],
      ["dot-1", "bam-2", "dot-1", "bam-2"],
      ["bam-2", "dot-1", "bam-2", "dot-1"],
    ]);
    // dot-1 and bam-2 never form a pair/run together; board is full.
    expect(hasAnyMove(board)).toBe(false);
  });

  it("canMove is direction-specific", () => {
    const board = emptyBoard();
    board[0] = loose("dot-1");
    expect(canMove(board, "left")).toBe(false);
    expect(canMove(board, "right")).toBe(true);
  });
});
