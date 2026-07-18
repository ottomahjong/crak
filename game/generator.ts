import type { Board, DragonColor, Suit, TargetPattern, Tile, TileTypeId } from "@/types";
import { shuffle, nextRandom } from "@/lib/rng";
import { ALL_TILE_TYPES, SUITS } from "@/game/tiles";

// ---------------------------------------------------------------------------
// Weighted "fair bag" tile generator
// ---------------------------------------------------------------------------
//
// A bag holds a balanced, shuffled distribution. We draw from the front until
// empty, then refill + reshuffle. Each bag is built with awareness of BOTH the
// current target and the current board, so the game tends to hand you the tiles
// that finish what you have already started:
//
//   • base distribution: numbers common, dragons uncommon, joker rare
//   • target weighting: extra copies of suits the hand needs
//   • dragon focus: when a dragon set is required, one colour is emphasised so
//     pairs/pungs are actually reachable (dragons are otherwise too sparse)
//   • board reinforcement: extra copies of tiles you already hold (finish a
//     pair into a pung, complete a 1-2-3 run)
//
// Anti-repeat and anti-starvation guards run at draw time.

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

function targetNeedsDragon(target: TargetPattern): boolean {
  return target.requirements.some((r) => !r.filledBy && r.kind === "dragon-set");
}

/** Loose-tile type tallies on the board, ignoring completed sets and jokers. */
function looseTally(board: Board): {
  numbers: Map<TileTypeId, number>;
  dragons: Map<DragonColor, number>;
} {
  const numbers = new Map<TileTypeId, number>();
  const dragons = new Map<DragonColor, number>();
  for (const t of board) {
    if (!t || t.state !== "loose") continue;
    if (t.dragon) dragons.set(t.dragon, (dragons.get(t.dragon) ?? 0) + 1);
    else if (t.suit && t.rank) {
      const key = `${t.suit}-${t.rank}` as TileTypeId;
      numbers.set(key, (numbers.get(key) ?? 0) + 1);
    }
  }
  return { numbers, dragons };
}

/**
 * Choose which dragon colour the bag should emphasise: the colour the player
 * already holds the most of, else deterministic by RNG. Keeps dragon sets
 * reachable without flooding the board with useless mixed dragons.
 */
function pickFocusDragon(board: Board, rngState: number): { color: DragonColor; rngState: number } {
  const { dragons } = looseTally(board);
  let best: DragonColor | null = null;
  let bestN = 0;
  for (const c of ["red", "green", "white"] as DragonColor[]) {
    const n = dragons.get(c) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  if (best) return { color: best, rngState };
  const r = nextRandom(rngState);
  const colors: DragonColor[] = ["red", "green", "white"];
  return { color: colors[Math.floor(r.value * 3)], rngState: r.state };
}

/** Build one balanced, target- and board-weighted, shuffled bag. */
export function buildBag(
  target: TargetPattern,
  rngState: number,
  board?: Board,
): { bag: TileTypeId[]; rngState: number } {
  const pool: TileTypeId[] = [];
  // Base distribution: numbers common, dragons uncommon, joker rare.
  for (const t of NUMBER_TYPES) pool.push(t, t);
  for (const t of DRAGON_TYPES) pool.push(t);
  pool.push("joker");

  let state = rngState;

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

  // Dragon focus: when a dragon set is unfilled, emphasise a single colour so a
  // pair/pung is realistically reachable.
  if (targetNeedsDragon(target)) {
    const focus = pickFocusDragon(board ?? [], state);
    state = focus.rngState;
    const focusType = `dragon-${focus.color}` as TileTypeId;
    pool.push(focusType, focusType, focusType); // total 4 of the focus colour
  }

  // Board reinforcement: help finish what the player already holds.
  if (board) {
    const { numbers, dragons } = looseTally(board);
    for (const [type, count] of numbers) {
      if (count >= 1) pool.push(type); // a second copy → pair
      if (count >= 2) pool.push(type); // a third copy → pung
    }
    for (const [color, count] of dragons) {
      if (count >= 1) pool.push(`dragon-${color}` as TileTypeId);
    }
  }

  const { result, state: shuffled } = shuffle(pool, state);
  return { bag: result, rngState: shuffled };
}

/**
 * Probability that a spawn is a "reinforcement" — a tile chosen to combine with
 * something already on the board — rather than a plain fair-bag draw. With 13
 * distinct tile types on a 16-cell board, purely random spawns pile up as
 * un-combinable junk; reinforcement keeps the board flowing so the player can
 * actually assemble a four-set hand. The remaining fraction stays fair-bag
 * random to preserve variety and tension.
 */
export const REINFORCE_P = 0.66;

/**
 * Pick a tile type that would help the player right now: complete a pung from an
 * existing pair, fill a 1-2-3 run gap, or pair up a lone tile. Target-relevant
 * options are weighted higher. Returns null when nothing on the board can be
 * reinforced (→ fall back to a fair-bag draw).
 */
export function helpfulSpawn(
  board: Board,
  target: TargetPattern,
  rngState: number,
): { type: TileTypeId | null; rngState: number } {
  const relevant = relevantTypes(target);
  const { numbers, dragons } = looseTally(board);

  type Cand = { type: TileTypeId; weight: number };
  const cands: Cand[] = [];
  const push = (type: TileTypeId, base: number) => {
    cands.push({ type, weight: base * (relevant.has(type) ? 1.6 : 1) });
  };

  // Complete a pung from an existing pair (finishes a real set → best).
  for (const t of board) {
    if (!t || t.state !== "completed" || t.setKind !== "pair") continue;
    if (t.suit && t.rank) push(`${t.suit}-${t.rank}` as TileTypeId, 7);
    else if (t.dragon) push(`dragon-${t.dragon}` as TileTypeId, 7);
  }

  // Fill a run gap: a suit with exactly two of {1,2,3} present among loose tiles.
  for (const suit of SUITS) {
    const present = new Set<number>();
    for (const r of [1, 2, 3]) if ((numbers.get(`${suit}-${r}` as TileTypeId) ?? 0) > 0) present.add(r);
    if (present.size === 2) {
      const missing = [1, 2, 3].find((r) => !present.has(r))!;
      push(`${suit}-${missing}` as TileTypeId, 6);
    }
  }

  // Pair up a lone tile.
  for (const [type, count] of numbers) if (count >= 1) push(type, count >= 2 ? 4 : 3);
  for (const [color, count] of dragons) if (count >= 1) push(`dragon-${color}` as TileTypeId, 3);

  if (cands.length === 0) return { type: null, rngState };

  const total = cands.reduce((a, c) => a + c.weight, 0);
  const r = nextRandom(rngState);
  let roll = r.value * total;
  for (const c of cands) {
    roll -= c.weight;
    if (roll <= 0) return { type: c.type, rngState: r.state };
  }
  return { type: cands[cands.length - 1].type, rngState: r.state };
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
export function drawTile(state: SpawnState, target: TargetPattern, board?: Board): SpawnResult {
  let bag = state.bag.slice();
  let rngState = state.rngState;

  if (bag.length === 0) {
    const refill = buildBag(target, rngState, board);
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
