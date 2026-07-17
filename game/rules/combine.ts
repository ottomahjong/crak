import type { CombineEvent, DragonColor, Rank, Suit, Tile } from "@/types";
import {
  isJoker,
  isLooseDragon,
  isLooseNumber,
  isPair,
  isPung,
  isRun,
  makePair,
  makePung,
  makeRun,
} from "@/game/tiles";

// ---------------------------------------------------------------------------
// Combination resolution
// ---------------------------------------------------------------------------
//
// Resolution order (documented here and in the README):
//   1. Compact the line (empty cells already removed by the caller).
//   2. PHASE 1 — direct collisions: pairs and pungs (incl. dragon + joker),
//      resolved greedily from the leading edge toward the trailing edge.
//      A tile consumed here cannot be reused; a set created here is terminal.
//   3. PHASE 2 — runs: three contiguous *loose* same-suit tiles (1-2-3, joker
//      may fill exactly one gap) collapse into a run, again scanned from the
//      leading edge.
//   4. Each source tile participates in at most one combination per move.
//   5. Pairs/pungs and completed sets never participate in runs.
//
// The caller passes tiles in leading→trailing order. The result "anchor" id is
// always the leading source, so the surviving element morphs in place while the
// trailing sources slide into it (used to drive animation).

export type ResolveItem = {
  tile: Tile;
  /** All input tile ids that produced this item (first = anchor/leading). */
  sources: string[];
};

export type ResolveResult = {
  items: ResolveItem[];
  events: CombineEvent[];
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
 * Attempt to combine two adjacent tiles into a pair or pung. Order-independent
 * for identity; returns null when the two tiles cannot form a direct collision.
 */
function tryMerge2(a: Tile, b: Tile): MergeSpec | null {
  // Terminal sets never merge further.
  if (isPung(a) || isPung(b) || isRun(a) || isRun(b)) return null;

  // Two loose numbers -> pair.
  const na = numberIdentity(a);
  const nb = numberIdentity(b);
  if (na && nb && na.suit === nb.suit && na.rank === nb.rank) {
    return {
      make: (id) => makePair({ suit: na.suit, rank: na.rank }, false, id),
      event: "pair",
      usedJoker: false,
    };
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
 * Determine whether three contiguous loose tiles form a run. Non-joker tiles
 * must be same-suit numbers with distinct ranks in {1,2,3}; at most one joker
 * may fill a single gap.
 */
function runEligible(a: Tile, b: Tile, c: Tile): { suit: Suit; usedJoker: boolean } | null {
  const tiles = [a, b, c];
  const jokers = tiles.filter(isJoker);
  if (jokers.length > 1) return null; // joker + joker never allowed
  const numbers = tiles.filter(isLooseNumber);
  if (numbers.length + jokers.length !== 3) return null; // dragons/sets disqualify
  if (numbers.length === 0) return null;

  const suit = numbers[0].suit as Suit;
  if (!numbers.every((t) => t.suit === suit)) return null;

  const ranks = numbers.map((t) => t.rank as Rank);
  const unique = new Set(ranks);
  if (unique.size !== ranks.length) return null; // duplicate rank -> not a run
  if (![...unique].every((r) => r >= 1 && r <= 3)) return null;

  // With no joker, we need exactly {1,2,3}. With one joker, two distinct ranks
  // in {1,2,3} always leave a fillable gap.
  if (jokers.length === 0 && unique.size !== 3) return null;

  return { suit, usedJoker: jokers.length === 1 };
}

/**
 * Resolve a single line of tiles (leading→trailing order, no empty cells).
 */
export function resolveLine(input: Tile[]): ResolveResult {
  const events: CombineEvent[] = [];

  // Phase 1: pairs & pungs.
  const phase1: ResolveItem[] = [];
  let i = 0;
  while (i < input.length) {
    const a = input[i];
    const b = input[i + 1];
    if (b) {
      const spec = tryMerge2(a, b);
      if (spec) {
        const tile = spec.make(a.id); // anchor = leading source id
        phase1.push({ tile, sources: [a.id, b.id] });
        events.push({ type: spec.event, tile, usedJoker: spec.usedJoker });
        i += 2;
        continue;
      }
    }
    phase1.push({ tile: a, sources: [a.id] });
    i += 1;
  }

  // Phase 2: runs (loose tiles only).
  const items: ResolveItem[] = [];
  let j = 0;
  while (j < phase1.length) {
    const a = phase1[j];
    const b = phase1[j + 1];
    const c = phase1[j + 2];
    if (
      a &&
      b &&
      c &&
      a.tile.state === "loose" &&
      b.tile.state === "loose" &&
      c.tile.state === "loose"
    ) {
      const run = runEligible(a.tile, b.tile, c.tile);
      if (run) {
        const tile = makeRun(run.suit, run.usedJoker, a.tile.id);
        items.push({ tile, sources: [...a.sources, ...b.sources, ...c.sources] });
        events.push({ type: "run", tile, usedJoker: run.usedJoker });
        j += 3;
        continue;
      }
    }
    items.push(a);
    j += 1;
  }

  return { items, events };
}
