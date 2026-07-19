import type { CombineEvent, DragonColor, Rank, Suit, Tile } from "@/types";
import {
  isJoker,
  isLooseDragon,
  isLooseNumber,
  isPair,
  isPartialRun,
  isPung,
  isRun,
  makePair,
  makePartialRun,
  makePung,
  makeRun,
  missingRank,
} from "@/game/tiles";

// ---------------------------------------------------------------------------
// Combination resolution
// ---------------------------------------------------------------------------
//
// ONE universal rule (documented here and in the README): every combination in
// CRAK! is a TWO-TILE COLLISION, resolved greedily from the leading edge of the
// swipe toward the trailing edge. A tile combines with the first tile it
// touches, at most once per move, and the result is placed where the leading
// tile was.
//
// The complete collision table:
//   loose X      + loose X            → PAIR of X
//   PAIR of X    + loose X (or Joker) → PUNG of X          (terminal)
//   dragon D     + dragon D           → DRAGON PAIR
//   DRAGON PAIR  + dragon D (/Joker)  → DRAGON PUNG        (terminal)
//   loose 1      + loose 2 (same suit)→ PARTIAL RUN 1·2
//   loose 2      + loose 3 (same suit)→ PARTIAL RUN 2·3
//   PARTIAL RUN  + missing rank (/Joker) → RUN             (terminal)
//
// Nothing else combines. In particular: 1+3 never combine (not adjacent),
// jokers never start a set (no joker pairs, no joker partials, no
// joker+joker), pungs/runs are terminal, and completed sets never join runs.
//
// The two-stage run replaced an earlier three-tile adjacency scan: runs now
// follow the exact same physics as pair→pung, which is the point.

export type ResolveItem = {
  tile: Tile;
  /** All input tile ids that produced this item (first = anchor/leading). */
  sources: string[];
};

export type ResolveResult = {
  items: ResolveItem[];
  events: CombineEvent[];
};

export type RuleOptions = {
  /** When false, partial-run and run merges are disabled (learning hand 1). */
  runs?: boolean;
};

type MergeSpec = {
  make: (id: string) => Tile;
  event: CombineEvent["type"];
  usedJoker: boolean;
};

function numberIdentity(t: Tile): { suit: Suit; rank: Rank } | null {
  return isLooseNumber(t) ? { suit: t.suit!, rank: t.rank! } : null;
}

/**
 * Attempt to combine two adjacent tiles. Order-independent for identity;
 * returns null when the two tiles cannot form a direct collision.
 */
function tryMerge2(a: Tile, b: Tile, opts: RuleOptions): MergeSpec | null {
  const runsEnabled = opts.runs !== false;

  // Terminal sets never merge further.
  if (isPung(a) || isPung(b) || isRun(a) || isRun(b)) return null;

  const na = numberIdentity(a);
  const nb = numberIdentity(b);

  // Two loose numbers: same rank → pair; adjacent ranks → partial run.
  if (na && nb && na.suit === nb.suit) {
    if (na.rank === nb.rank) {
      return {
        make: (id) => makePair({ suit: na.suit, rank: na.rank }, false, id),
        event: "pair",
        usedJoker: false,
      };
    }
    if (runsEnabled && Math.abs(na.rank - nb.rank) === 1) {
      const lo = Math.min(na.rank, nb.rank) as Rank;
      const hi = Math.max(na.rank, nb.rank) as Rank;
      return {
        make: (id) => makePartialRun(na.suit, [lo, hi], id),
        event: "partial-run",
        usedJoker: false,
      };
    }
  }

  // Two loose dragons -> dragon pair.
  if (isLooseDragon(a) && isLooseDragon(b) && a.dragon === b.dragon) {
    const dragon = a.dragon as DragonColor;
    return {
      make: (id) => makePair({ dragon }, false, id),
      event: "dragon-pair",
      usedJoker: false,
    };
  }

  // Partial run + missing rank (or joker) -> run.
  const part = isPartialRun(a) ? a : isPartialRun(b) ? b : null;
  const partOther = part === a ? b : part === b ? a : null;
  if (runsEnabled && part && partOther && part.suit) {
    const need = missingRank(part);
    const suit = part.suit;
    const fills =
      (isLooseNumber(partOther) && partOther.suit === suit && partOther.rank === need) ||
      isJoker(partOther);
    if (fills) {
      return {
        make: (id) => makeRun(suit, isJoker(partOther), id),
        event: "run",
        usedJoker: isJoker(partOther),
      };
    }
    return null; // a partial matches nothing else
  }

  // Pair + matching loose tile (or joker) -> pung.
  const pair = isPair(a) ? a : isPair(b) ? b : null;
  const other = pair === a ? b : pair === b ? a : null;
  if (pair && other) {
    // Number pair.
    if (pair.suit && pair.rank) {
      const matches =
        (isLooseNumber(other) && other.suit === pair.suit && other.rank === pair.rank) ||
        isJoker(other);
      if (matches) {
        const suit = pair.suit;
        const rank = pair.rank;
        return {
          make: (id) => makePung({ suit, rank }, isJoker(other), id),
          event: "pung",
          usedJoker: isJoker(other),
        };
      }
    }
    // Dragon pair.
    if (pair.dragon) {
      const matches =
        (isLooseDragon(other) && other.dragon === pair.dragon) || isJoker(other);
      if (matches) {
        const dragon = pair.dragon;
        return {
          make: (id) => makePung({ dragon }, isJoker(other), id),
          event: "dragon-pung",
          usedJoker: isJoker(other),
        };
      }
    }
  }

  return null;
}

/**
 * Resolve a single line of tiles (leading→trailing order, no empty cells).
 * A single greedy pass: each tile may combine with its immediate neighbor at
 * most once. Results of a merge never chain within the same move.
 */
export function resolveLine(input: Tile[], opts: RuleOptions = {}): ResolveResult {
  const events: CombineEvent[] = [];
  const items: ResolveItem[] = [];

  let i = 0;
  while (i < input.length) {
    const a = input[i];
    const b = input[i + 1];
    if (b) {
      const spec = tryMerge2(a, b, opts);
      if (spec) {
        const tile = spec.make(a.id); // anchor = leading source id
        items.push({ tile, sources: [a.id, b.id] });
        events.push({ type: spec.event, tile, usedJoker: spec.usedJoker });
        i += 2;
        continue;
      }
    }
    items.push({ tile: a, sources: [a.id] });
    i += 1;
  }

  return { items, events };
}
