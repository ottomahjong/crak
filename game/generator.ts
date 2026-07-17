import type { Suit, TargetPattern, TileTypeId } from "@/types";
import { shuffle, nextRandom } from "@/lib/rng";
import { ALL_TILE_TYPES, SUITS } from "@/game/tiles";

// ---------------------------------------------------------------------------
// Weighted "fair bag" tile generator
// ---------------------------------------------------------------------------
//
// A bag holds a balanced, shuffled distribution. We draw from the front until
// empty, then refill + reshuffle. Small target-aware weighting biases each bag
// toward suits the current hand needs, and an anti-repeat guard avoids long
// runs of identical spawns or long stretches with nothing relevant.

const NUMBER_TYPES: TileTypeId[] = [
  "dot-1", "dot-2", "dot-3",
  "bam-1", "bam-2", "bam-3",
  "crak-1", "crak-2", "crak-3",
];
const DRAGON_TYPES: TileTypeId[] = ["dragon-red", "dragon-green", "dragon-white"];

const MAX_CONSECUTIVE_SAME = 3;
const STARVATION_WINDOW = 5;

function suitTypes(suit: Suit): TileTypeId[] {
  return [1, 2, 3].map((r) => `${suit}-${r}` as TileTypeId);
}

/** Tile types that would help progress the current target. */
export function relevantTypes(target: TargetPattern): Set<TileTypeId> {
  const set = new Set<TileTypeId>();
  const addAllNumbers = () => NUMBER_TYPES.forEach((t) => set.add(t));
  const addDragons = () => DRAGON_TYPES.forEach((t) => set.add(t));
  for (const req of target.requirements) {
    if (req.filledBy) continue;
    switch (req.kind) {
      case "suit-set":
      case "suit-run":
        if (req.suit) suitTypes(req.suit).forEach((t) => set.add(t));
        break;
      case "number-pung":
      case "suited-run":
        addAllNumbers();
        break;
      case "dragon-set":
        addDragons();
        break;
      case "any-pair":
      case "any-set":
        addAllNumbers();
        addDragons();
        break;
    }
  }
  set.add("joker");
  return set;
}

/** Build one balanced, target-weighted, shuffled bag. */
export function buildBag(
  target: TargetPattern,
  rngState: number,
): { bag: TileTypeId[]; rngState: number } {
  const pool: TileTypeId[] = [];
  // Base distribution: numbers common, dragons uncommon, joker rare.
  for (const t of NUMBER_TYPES) pool.push(t, t);
  for (const t of DRAGON_TYPES) pool.push(t);
  pool.push("joker");

  // Target-aware weighting: one extra copy of each suit needed by the hand.
  const neededSuits = new Set<Suit>();
  for (const req of target.requirements) {
    if (req.filledBy) continue;
    if ((req.kind === "suit-set" || req.kind === "suit-run") && req.suit) {
      neededSuits.add(req.suit);
    }
  }
  for (const suit of SUITS) {
    if (neededSuits.has(suit)) suitTypes(suit).forEach((t) => pool.push(t));
  }

  const { result, state } = shuffle(pool, rngState);
  return { bag: result, rngState: state };
}

export type SpawnState = {
  bag: TileTypeId[];
  rngState: number;
  recentSpawns: TileTypeId[];
};

export type SpawnResult = SpawnState & { type: TileTypeId };

/**
 * Draw the next tile type, applying anti-repeat and anti-starvation guards.
 */
export function drawTile(state: SpawnState, target: TargetPattern): SpawnResult {
  let bag = state.bag.slice();
  let rngState = state.rngState;

  if (bag.length === 0) {
    const refill = buildBag(target, rngState);
    bag = refill.bag;
    rngState = refill.rngState;
  }

  const relevant = relevantTypes(target);
  const recent = state.recentSpawns;

  // Count trailing identical spawns.
  const lastType = recent[recent.length - 1];
  let trailingSame = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i] === lastType; i--) trailingSame++;

  const recentWindow = recent.slice(-STARVATION_WINDOW);
  const starving =
    recentWindow.length >= STARVATION_WINDOW &&
    !recentWindow.some((t) => relevant.has(t));

  // Choose an index in the bag to draw. Default: front.
  let drawIndex = 0;
  const front = bag[0];

  const wouldRepeat = front === lastType && trailingSame >= MAX_CONSECUTIVE_SAME;
  const wouldStarve = starving && !relevant.has(front);

  if (wouldRepeat || wouldStarve) {
    const better = bag.findIndex((t, i) => {
      if (i === 0) return false;
      if (wouldStarve && !relevant.has(t)) return false;
      if (wouldRepeat && t === lastType) return false;
      return true;
    });
    if (better !== -1) drawIndex = better;
  }

  const type = bag[drawIndex];
  bag.splice(drawIndex, 1);

  const recentSpawns = [...recent, type].slice(-8);
  return { type, bag, rngState, recentSpawns };
}

/** Pick a random empty cell index using the deterministic RNG. */
export function pickEmptyCell(
  emptyCells: number[],
  rngState: number,
): { cell: number; rngState: number } {
  const r = nextRandom(rngState);
  const cell = emptyCells[Math.floor(r.value * emptyCells.length)];
  return { cell, rngState: r.state };
}

/** Exposed for the debug panel / tests. */
export const GENERATOR_INTERNALS = { NUMBER_TYPES, DRAGON_TYPES, ALL_TILE_TYPES };
