import { BOARD_SIZE } from "@/types";

// Board is a square. Everything is expressed as a fraction of the board so the
// layout is fully responsive and animation transforms stay simple.

export const GAP_FRAC = 0.035;
export const CELL_FRAC = (1 - (BOARD_SIZE + 1) * GAP_FRAC) / BOARD_SIZE;

export function cellToRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE };
}

/** Percentage position + size for a tile occupying a given cell. */
export function cellStyle(index: number): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const { row, col } = cellToRowCol(index);
  const left = GAP_FRAC + col * (CELL_FRAC + GAP_FRAC);
  const top = GAP_FRAC + row * (CELL_FRAC + GAP_FRAC);
  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${CELL_FRAC * 100}%`,
    height: `${CELL_FRAC * 100}%`,
  };
}
