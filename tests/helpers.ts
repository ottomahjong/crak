import type { Board, Tile, TileTypeId } from "@/types";
import { CELL_COUNT } from "@/types";
import { makeLooseFromType } from "@/game/tiles";

let n = 0;
export function loose(type: TileTypeId, id?: string): Tile {
  n += 1;
  return makeLooseFromType(type, id ?? `${type}#${n}`);
}

export function emptyBoard(): Board {
  return new Array(CELL_COUNT).fill(null);
}

/**
 * Build a board from a compact 4x4 spec. Use tile-type ids or "." for empty.
 * Each inner array is a row (top to bottom).
 */
export function boardFrom(rows: (TileTypeId | ".")[][]): Board {
  const board = emptyBoard();
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== ".") board[r * 4 + c] = loose(cell as TileTypeId);
    });
  });
  return board;
}

/** Render a board back to a grid of short codes for assertions. */
export function describeBoard(board: Board): string[][] {
  const grid: string[][] = [];
  for (let r = 0; r < 4; r++) {
    const row: string[] = [];
    for (let c = 0; c < 4; c++) {
      const t = board[r * 4 + c];
      row.push(t ? code(t) : ".");
    }
    grid.push(row);
  }
  return grid;
}

export function code(t: Tile): string {
  if (t.state === "loose") {
    if (t.isJoker) return "joker";
    if (t.dragon) return `dragon-${t.dragon}`;
    return `${t.suit}-${t.rank}`;
  }
  const id = t.suit ? `${t.suit}${t.rank ?? ""}` : `dragon-${t.dragon}`;
  return `${t.setKind}:${id}`;
}

export function tilesOnBoard(board: Board): Tile[] {
  return board.filter((t): t is Tile => !!t);
}
