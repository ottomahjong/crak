import type { Board, DragonColor, Suit, TargetPattern, TileTypeId } from "@/types";
import { isPartialRun, missingRank } from "@/game/tiles";
import { nextRandom } from "@/lib/rng";
import { ALL_TILE_TYPES, SUITS } from "@/game/tiles";
import { buildWall, type TileInventoryConfig } from "@/game/inventory";

// ---------------------------------------------------------------------------
// Drawing from the finite wall
// ---------------------------------------------------------------------------
//
// The wall (see game/inventory.ts) is a fixed, shuffled multiset. Every spawn
// removes one tile from it; nothing is ever conjured beyond inventory. What the
// generator DOES influence is *which* of the tiles still in the wall comes out
// next:
//
//   • reinforcement — bias toward a tile that combines with the board (finish a
//     pung from a pair, fill a 1-2-3 run gap, pair up a lone tile), chosen only
//     among tiles the wall still holds;
//   • anti-repeat / anti-starvation guards on the fair draws.
//
// It can never add copies to make a hand easier — that is the finite wall's job
// and the solvability system's concern. When the wall empties, a finite mode
// returns no tile; a reshuffling mode (tutorials) rebuilds it.

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
      case "number-kong":
      case "number-quint":
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
 * The reinforcement chance rises with board fullness. Under the spawn-every-
 * swipe model a congested board urgently needs combinable tiles to drain back
 * down, so a near-full board reinforces almost every time.
 */
export const REINFORCE_P = 0.7;
export const REINFORCE_P_CONGESTION = 0.28;
export const REINFORCE_P_MAX = 0.95;

/**
 * Pick a tile type that would help the player right now: complete a pung from an
 * existing pair, fill a 1-2-3 run gap, or pair up a lone tile. Restricted to
 * `available` types (the tiles the wall still holds) so reinforcement never
 * promises a tile the finite wall can't deliver. Returns null when nothing on
 * the board can be usefully reinforced (→ fall back to a fair draw).
 */
export function helpfulSpawn(
  board: Board,
  target: TargetPattern,
  rngState: number,
  avoid?: TileTypeId,
  allowed?: ReadonlySet<TileTypeId>,
  available?: ReadonlySet<TileTypeId>,
): { type: TileTypeId | null; rngState: number } {
  const relevant = relevantTypes(target);
  const { numbers, dragons } = looseTally(board);

  type Cand = { type: TileTypeId; weight: number };
  const cands: Cand[] = [];
  const push = (type: TileTypeId, base: number) => {
    if (type === avoid) return; // diversify: don't reinforce the just-spawned type
    if (allowed && !allowed.has(type)) return;
    if (available && !available.has(type)) return; // not in the wall any more
    cands.push({ type, weight: base * (relevant.has(type) ? 1.6 : 1) });
  };

  // Finish a set that is one tile away (best): pung from a pair, run from a
  // partial (1·2 needs the 3, 2·3 needs the 1).
  for (const t of board) {
    if (!t || t.state !== "completed") continue;
    if (t.setKind === "pair" || t.setKind === "pung" || t.setKind === "kong") {
      // pair→pung, and (advanced) pung→kong, kong→quint all want another copy.
      if (t.suit && t.rank) push(`${t.suit}-${t.rank}` as TileTypeId, 7);
      else if (t.dragon) push(`dragon-${t.dragon}` as TileTypeId, 7);
    } else if (isPartialRun(t) && t.suit) {
      const need = missingRank(t);
      if (need) push(`${t.suit}-${need}` as TileTypeId, 7);
    }
  }

  // Enable a run chain: a suit holding loose 1 and 3 (which cannot collide)
  // needs the 2 to bridge them.
  for (const suit of SUITS) {
    const has1 = (numbers.get(`${suit}-1` as TileTypeId) ?? 0) > 0;
    const has2 = (numbers.get(`${suit}-2` as TileTypeId) ?? 0) > 0;
    const has3 = (numbers.get(`${suit}-3` as TileTypeId) ?? 0) > 0;
    if (has1 && has3 && !has2) push(`${suit}-2` as TileTypeId, 6);
  }

  // Pair up a lone tile (count 1), or edge toward a pung (count 2+). A held
  // duplicate is weighted LOWER than a lone tile so a type the board already
  // holds two of doesn't flood.
  for (const [type, count] of numbers) {
    if (count === 1) push(type, 3);
    else if (count >= 2) push(type, 2);
  }
  for (const [color, count] of dragons) {
    if (count === 1) push(`dragon-${color}` as TileTypeId, 3);
    else if (count >= 2) push(`dragon-${color}` as TileTypeId, 2);
  }

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

export type WallDraw = {
  type: TileTypeId;
  wall: TileTypeId[];
  rngState: number;
  recentSpawns: TileTypeId[];
};

/**
 * Draw the next tile from the finite wall. Returns null when the wall is empty
 * and the config does not reshuffle — the signal that no tile can spawn.
 */
export function drawFromWall(args: {
  wall: TileTypeId[];
  rngState: number;
  recentSpawns: TileTypeId[];
  board: Board;
  target: TargetPattern;
  cfg: TileInventoryConfig;
  allowed?: ReadonlySet<TileTypeId>;
  reinforceP: number;
  forcedType?: TileTypeId | null;
}): WallDraw | null {
  let wall = args.wall.slice();
  let rngState = args.rngState;
  const { recentSpawns, board, target, cfg, allowed, reinforceP, forcedType } = args;

  if (wall.length === 0) {
    if (!cfg.reshuffleWhenEmpty) return null; // finite mode: the wall is spent
    const rebuilt = buildWall(cfg, rngState, allowed);
    wall = rebuilt.wall;
    rngState = rebuilt.rngState;
    if (wall.length === 0) return null;
  }

  const available = new Set(wall);

  const take = (index: number): WallDraw => {
    const type = wall[index];
    wall.splice(index, 1);
    return { type, wall, rngState, recentSpawns: [...recentSpawns, type].slice(-8) };
  };

  // Solvability steer: draw a specific still-available copy straight away.
  if (forcedType && available.has(forcedType)) {
    return take(wall.indexOf(forcedType));
  }

  // Reinforcement: a helpful, still-available tile combines with the board.
  const roll = nextRandom(rngState);
  rngState = roll.state;
  if (roll.value < reinforceP) {
    const last = recentSpawns[recentSpawns.length - 1];
    let trailing = 0;
    for (let i = recentSpawns.length - 1; i >= 0 && recentSpawns[i] === last; i--) trailing++;
    const avoid = trailing >= 2 ? last : undefined;
    const h = helpfulSpawn(board, target, rngState, avoid, allowed, available);
    rngState = h.rngState;
    if (h.type && available.has(h.type)) return take(wall.indexOf(h.type));
  }

  // Fair draw from the front, with anti-repeat / anti-starvation reordering.
  const relevant = relevantTypes(target);
  const last = recentSpawns[recentSpawns.length - 1];
  let trailingSame = 0;
  for (let i = recentSpawns.length - 1; i >= 0 && recentSpawns[i] === last; i--) trailingSame++;
  const recentWindow = recentSpawns.slice(-STARVATION_WINDOW);
  const starving =
    recentWindow.length >= STARVATION_WINDOW && !recentWindow.some((t) => relevant.has(t));

  let drawIndex = 0;
  const front = wall[0];
  const wouldRepeat = front === last && trailingSame >= MAX_CONSECUTIVE_SAME;
  const wouldStarve = starving && !relevant.has(front);
  if (wouldRepeat || wouldStarve) {
    const better = wall.findIndex((t, i) => {
      if (i === 0) return false;
      if (wouldStarve && !relevant.has(t)) return false;
      if (wouldRepeat && t === last) return false;
      return true;
    });
    if (better !== -1) drawIndex = better;
  }

  return take(drawIndex);
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
