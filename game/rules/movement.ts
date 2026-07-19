import type { Board, Direction, Merge, MoveResult, Slide, Tile } from "@/types";
import { BOARD_SIZE, CELL_COUNT } from "@/types";
import { resolveLine, type RuleOptions } from "@/game/rules/combine";

// ---------------------------------------------------------------------------
// Board line geometry
// ---------------------------------------------------------------------------

/**
 * Returns, for each of the four lines, the ordered cell indices from the
 * LEADING edge (where tiles pile up) to the trailing edge, for a given swipe.
 */
export function lineCellsFor(direction: Direction): number[][] {
  const lines: number[][] = [];
  for (let k = 0; k < BOARD_SIZE; k++) {
    const line: number[] = [];
    for (let n = 0; n < BOARD_SIZE; n++) {
      let idx: number;
      switch (direction) {
        case "left":
          idx = k * BOARD_SIZE + n; // row k, cols left→right
          break;
        case "right":
          idx = k * BOARD_SIZE + (BOARD_SIZE - 1 - n); // row k, cols right→left
          break;
        case "up":
          idx = n * BOARD_SIZE + k; // col k, rows top→bottom
          break;
        case "down":
          idx = (BOARD_SIZE - 1 - n) * BOARD_SIZE + k; // col k, rows bottom→top
          break;
      }
      line.push(idx);
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Apply a move
// ---------------------------------------------------------------------------

export function applyMove(
  board: Board,
  direction: Direction,
  opts: RuleOptions = {},
): MoveResult {
  const next: Board = new Array(CELL_COUNT).fill(null);
  const slides: Slide[] = [];
  const merges: Merge[] = [];
  const events: MoveResult["events"] = [];
  let changed = false;

  const lines = lineCellsFor(direction);

  for (const cells of lines) {
    // Gather non-empty tiles in leading→trailing order, remembering origins.
    const tiles: Tile[] = [];
    const origin = new Map<string, number>();
    for (const cell of cells) {
      const t = board[cell];
      if (t) {
        tiles.push(t);
        origin.set(t.id, cell);
      }
    }

    const { items, events: lineEvents } = resolveLine(tiles, opts);
    events.push(...lineEvents);

    // Place results at leading cells; compute animation deltas.
    items.forEach((item, p) => {
      const targetCell = cells[p];
      next[targetCell] = item.tile;

      const anchorId = item.tile.id;
      for (const srcId of item.sources) {
        const fromCell = origin.get(srcId)!;
        if (srcId === anchorId) {
          slides.push({ id: srcId, from: fromCell, to: targetCell });
          if (fromCell !== targetCell) changed = true;
        } else {
          merges.push({ id: srcId, into: anchorId, at: targetCell });
          changed = true; // a merge always changes the board
        }
      }
    });
  }

  return { board: next, changed, events, slides, merges };
}

// ---------------------------------------------------------------------------
// Move availability
// ---------------------------------------------------------------------------

/** True if the given direction would change the board. */
export function canMove(board: Board, direction: Direction, opts: RuleOptions = {}): boolean {
  return applyMove(board, direction, opts).changed;
}

/** True if any of the four directions is a legal move. */
export function hasAnyMove(board: Board, opts: RuleOptions = {}): boolean {
  return (["up", "down", "left", "right"] as Direction[]).some((d) =>
    canMove(board, d, opts),
  );
}

/** The board is a dead end: every cell occupied and no direction changes it. */
export function isGameOver(board: Board, opts: RuleOptions = {}): boolean {
  const full = board.every((c) => c !== null);
  return full && !hasAnyMove(board, opts);
}

// ---------------------------------------------------------------------------
// Spawn entry geometry
// ---------------------------------------------------------------------------

/**
 * New tiles enter from the edge OPPOSITE the swipe: swipe left → the new tile
 * enters at the right edge, etc. Returns cell indices line by line, starting at
 * the entry edge and walking inward (depth 0 = the edge itself), so the caller
 * can take the first line that has an empty cell.
 */
export function entryLinesFor(direction: Direction): number[][] {
  const lines: number[][] = [];
  for (let depth = 0; depth < BOARD_SIZE; depth++) {
    const line: number[] = [];
    for (let k = 0; k < BOARD_SIZE; k++) {
      switch (direction) {
        case "left": // enters from the right edge, walking left
          line.push(k * BOARD_SIZE + (BOARD_SIZE - 1 - depth));
          break;
        case "right": // enters from the left edge, walking right
          line.push(k * BOARD_SIZE + depth);
          break;
        case "up": // enters from the bottom edge, walking up
          line.push((BOARD_SIZE - 1 - depth) * BOARD_SIZE + k);
          break;
        case "down": // enters from the top edge, walking down
          line.push(depth * BOARD_SIZE + k);
          break;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The board side a spawned tile visually enters from, for a given swipe. */
export function entryEdgeFor(direction: Direction): Direction {
  switch (direction) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "up":
      return "down"; // bottom edge
    case "down":
      return "up"; // top edge
  }
}
