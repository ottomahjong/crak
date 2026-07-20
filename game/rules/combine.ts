import type { CombineEvent, DragonColor, Rank, Suit, Tile } from "@/types";
import {
  isJoker,
  isKong,
  isLooseDragon,
  isLooseNumber,
  isPair,
  isPartialRun,
  isPung,
  isQuint,
  isRun,
  makeKong,
  makePair,
  makePartialRun,
  makePung,
  makeQuint,
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
// On ADVANCED levels (opts.kongs) the pung line extends two more steps:
//   PUNG of X    + loose X (or Joker) → KONG of X   (four of a kind)
//   KONG of X    + loose X (or Joker) → QUINT of X  (five of a kind, terminal)
// Dragons kong/quint the same way. When opts.kongs is off, a pung is terminal.
//
// Nothing else combines. In particular: 1+3 never combine (not adjacent),
// jokers never start a set (no joker pairs, no joker partials, no
// joker+joker), runs/quints are terminal, and completed sets never join runs.
//
// The two-stage run replaced an earlier three-tile adjacency scan: runs now
// follow the exact same physics as pair→pung, which is the point.

export type RuleOptions = {
  /** When false, partial-run and run merges are disabled (learning hand 1). */
  runs?: boolean;
  /** When true, pungs may extend to kongs (4) and quints (5) — advanced levels. */
  kongs?: boolean;
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
  const kongsEnabled = opts.kongs === true;

  // Runs and quints are always terminal.
  if (isRun(a) || isRun(b) || isQuint(a) || isQuint(b)) return null;

  // Pung/Kong extension (advanced): pung + match → kong, kong + match → quint.
  const extendable = isPung(a) || isKong(a) ? a : isPung(b) || isKong(b) ? b : null;
  if (isPung(a) || isPung(b) || isKong(a) || isKong(b)) {
    if (!kongsEnabled || !extendable) return null;
    const other = extendable === a ? b : a;
    const toKong = isPung(extendable);
    // Number set: matching loose number (or joker) extends it.
    if (extendable.suit && extendable.rank) {
      const matches =
        (isLooseNumber(other) &&
          other.suit === extendable.suit &&
          other.rank === extendable.rank) ||
        isJoker(other);
      if (matches) {
        const suit = extendable.suit;
        const rank = extendable.rank;
        const wild = isJoker(other) || !!extendable.usedJoker;
        return {
          make: (id) => (toKong ? makeKong({ suit, rank }, wild, id) : makeQuint({ suit, rank }, wild, id)),
          event: toKong ? "kong" : "quint",
          usedJoker: wild,
        };
      }
    }
    // Dragon set: matching dragon (or joker) extends it.
    if (extendable.dragon) {
      const matches = (isLooseDragon(other) && other.dragon === extendable.dragon) || isJoker(other);
      if (matches) {
        const dragon = extendable.dragon;
        const wild = isJoker(other) || !!extendable.usedJoker;
        return {
          make: (id) => (toKong ? makeKong({ dragon }, wild, id) : makeQuint({ dragon }, wild, id)),
          event: toKong ? "dragon-kong" : "quint",
          usedJoker: wild,
        };
      }
    }
    return null;
  }

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

export type Combined = {
  /** The resulting set, carrying `anchor.id` so it stays where the anchor was. */
  tile: Tile;
  event: CombineEvent["type"];
  usedJoker: boolean;
};

/**
 * Attempt to combine an `incoming` tile that is moving INTO an `anchor` tile
 * (the forward neighbour in the swipe direction). The result keeps the anchor's
 * id so the composite set stays in the anchor's cell. Order-independent for
 * identity; returns null when the two cannot combine.
 *
 * This is the ONLY combination primitive under one-step movement: a tile
 * combines with the single cell it steps into, never with a tile several cells
 * away, and never more than once per swipe.
 */
export function tryCombine(anchor: Tile, incoming: Tile, opts: RuleOptions = {}): Combined | null {
  const spec = tryMerge2(anchor, incoming, opts);
  if (!spec) return null;
  return { tile: spec.make(anchor.id), event: spec.event, usedJoker: spec.usedJoker };
}
