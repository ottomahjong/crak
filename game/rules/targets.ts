import type { Board, TargetPattern, TargetRequirement, Tile } from "@/types";
import { isDragonSet, isKong, isPair, isPung, isQuint, isRun } from "@/game/tiles";

/** A pung, kong or quint — three-or-more of a kind. */
const isPungOrBigger = (t: Tile) => isPung(t) || isKong(t) || isQuint(t);
/** Any completed "set" that fills a generic set slot: pung/kong/quint or run. */
const isAnySet = (t: Tile) => isPungOrBigger(t) || isRun(t);

// ---------------------------------------------------------------------------
// Target matching
// ---------------------------------------------------------------------------

/** Does a completed set tile satisfy a requirement (ignoring assignment)? */
export function matchesRequirement(req: TargetRequirement, tile: Tile): boolean {
  if (tile.state !== "completed") return false;
  switch (req.kind) {
    case "any-pair":
      return isPair(tile);
    case "number-pung":
      return isPungOrBigger(tile) && !!tile.suit;
    case "number-kong":
      return (isKong(tile) || isQuint(tile)) && !!tile.suit;
    case "number-quint":
      return isQuint(tile) && !!tile.suit;
    case "suited-run":
      return isRun(tile);
    case "dragon-set":
      return isDragonSet(tile);
    case "suit-set":
      return (isPungOrBigger(tile) || isRun(tile)) && tile.suit === req.suit;
    case "suit-run":
      return isRun(tile) && tile.suit === req.suit;
    case "any-set":
      return isAnySet(tile);
    default:
      return false;
  }
}

/** Higher = more specific; specific slots are filled first. */
function specificity(req: TargetRequirement): number {
  switch (req.kind) {
    case "number-quint":
      return 7;
    case "number-kong":
      return 6;
    case "suit-run":
      return 5;
    case "suit-set":
      return 4;
    case "dragon-set":
    case "number-pung":
    case "suited-run":
      return 3;
    case "any-set":
      return 2;
    case "any-pair":
      return 1;
    default:
      return 0;
  }
}

export type ReconcileResult = {
  target: TargetPattern;
  board: Board;
  newlyFilled: string[]; // requirement ids filled during this reconcile
  complete: boolean;
};

/**
 * Recompute target-slot assignments from the completed sets on the board.
 *
 * Rules:
 *  - Each completed set may fill at most one slot.
 *  - Existing valid assignments are preserved (stable across moves).
 *  - Remaining slots are filled most-specific-first, so a "DOT RUN" claims a
 *    dot run before a generic "SUITED RUN" does.
 */
export function reconcileTargets(target: TargetPattern, board: Board): ReconcileResult {
  const tilesById = new Map<string, Tile>();
  for (const t of board) if (t) tilesById.set(t.id, t);

  const usedTileIds = new Set<string>();
  const newlyFilled: string[] = [];

  // Clone requirements so callers stay pure.
  const requirements: TargetRequirement[] = target.requirements.map((r) => ({ ...r }));

  // 1. Keep still-valid existing assignments.
  for (const r of requirements) {
    if (r.filledBy) {
      const tile = tilesById.get(r.filledBy);
      if (tile && matchesRequirement(r, tile)) {
        usedTileIds.add(tile.id);
      } else {
        r.filledBy = undefined; // stale — will try to refill
      }
    }
  }

  // 2. Fill remaining slots, most specific first.
  const order = requirements
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.filledBy)
    .sort((a, b) => specificity(b.r) - specificity(a.r) || a.i - b.i);

  for (const { r } of order) {
    for (const tile of board) {
      if (!tile || usedTileIds.has(tile.id)) continue;
      if (matchesRequirement(r, tile)) {
        r.filledBy = tile.id;
        usedTileIds.add(tile.id);
        newlyFilled.push(r.id);
        break;
      }
    }
  }

  // 3. Reflect usedForTarget on the board tiles.
  const nextBoard: Board = board.map((tile) => {
    if (!tile) return null;
    const used = usedTileIds.has(tile.id);
    if (!!tile.usedForTarget === used) return tile;
    return { ...tile, usedForTarget: used };
  });

  const complete = requirements.every((r) => !!r.filledBy);

  return {
    target: { ...target, requirements },
    board: nextBoard,
    newlyFilled,
    complete,
  };
}
