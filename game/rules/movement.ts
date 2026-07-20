import type { Board, Direction, Merge, MoveResult, Slide, Tile } from "@/types";
import { BOARD_SIZE, CELL_COUNT } from "@/types";
import { tryCombine, type RuleOptions } from "@/game/rules/combine";

// ---------------------------------------------------------------------------
// Movement model: ONE SWIPE = ONE STEP.
//
// Every eligible tile moves at most one cell in the swipe direction. Tiles do
// not slide across empty space, do not jump or pass through other tiles, and a
// tile takes exactly one action per swipe (move OR combine, never both, never
// twice). A set formed this swipe stays put until the next swipe.
//
// Each row/column is resolved independently, processed from the LEADING edge
// (the side tiles move toward) to the trailing edge. Leading-edge-first is what
// makes the result deterministic and chain-free: by the time a tile is
// considered, the cell ahead of it has already been finalised, so it either
// steps into a now-empty cell, combines with the settled tile there, or is
// blocked — with no possibility of a second hop.
// ---------------------------------------------------------------------------

/**
 * Returns, for each of the four lines, the ordered cell indices from the
 * LEADING edge (index 0 = the edge tiles move toward) to the trailing edge.
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

  for (const cells of lineCellsFor(direction)) {
    // L holds the line's tiles indexed leading(0)→trailing(3).
    const L: (Tile | null)[] = cells.map((c) => board[c] ?? null);

    // R is the resolved line. fromPos[p] = the original index of the tile now at
    // R[p] (so we can animate its one-cell slide). locked[p] marks a set formed
    // THIS swipe, which cannot accept a further tile (no chaining).
    const R: (Tile | null)[] = [null, null, null, null];
    const fromPos: (number | null)[] = [null, null, null, null];
    const locked = [false, false, false, false];

    for (let i = 0; i < BOARD_SIZE; i++) {
      const t = L[i];
      if (!t) continue;

      if (i === 0) {
        // Already at the leading edge — cannot advance; may still receive a
        // combine from the tile behind it.
        R[0] = t;
        fromPos[0] = 0;
        continue;
      }

      const d = i - 1; // the single cell this tile could step into
      const ahead = R[d];

      if (ahead === null) {
        // Step exactly one cell into the (now-settled) empty cell ahead.
        R[d] = t;
        fromPos[d] = i;
      } else if (!locked[d]) {
        const combined = tryCombine(ahead, t, opts);
        if (combined) {
          // Combine into the forward neighbour; the set keeps the anchor's id
          // and cell, and is locked against any further combine this swipe.
          R[d] = combined.tile;
          locked[d] = true;
          events.push({ type: combined.event, tile: combined.tile, usedJoker: combined.usedJoker });
          merges.push({ id: t.id, into: ahead.id, at: cells[d] });
          changed = true;
          continue;
        }
        // Blocked by an incompatible neighbour — stay put.
        R[i] = t;
        fromPos[i] = i;
      } else {
        // Neighbour already holds a set formed this swipe — blocked, stay put.
        R[i] = t;
        fromPos[i] = i;
      }
    }

    // Commit the line and record surviving-tile slides.
    for (let p = 0; p < BOARD_SIZE; p++) {
      const tile = R[p];
      if (!tile) continue;
      next[cells[p]] = tile;
      const from = fromPos[p]!;
      slides.push({ id: tile.id, from: cells[from], to: cells[p] });
      if (from !== p) changed = true;
    }
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
