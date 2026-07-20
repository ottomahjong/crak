import type { DragonColor, Suit, TileTypeId } from "@/types";
import { shuffle } from "@/lib/rng";

// ---------------------------------------------------------------------------
// Finite tile wall — the game's inventory of record
// ---------------------------------------------------------------------------
//
// CRAK! draws from a FINITE, American Mahjong-inspired wall, not an endless
// stream. Every tile that ever appears on the board is one draw removed from
// this wall; once all copies of a tile have been drawn, no more can appear
// unless a mode explicitly rebuilds the wall (reshuffleWhenEmpty). This is the
// central mechanic that separates CRAK! from Threes / 2048: the supply is
// knowable, exhaustible, and part of the strategy and fairness system.
//
// ALL inventory quantities live here. Nothing else in the engine hard-codes a
// tile count — code asks this module how many of a thing the wall holds.

/** A configurable description of a tile wall. */
export type TileInventoryConfig = {
  /** Numbered suits present, e.g. dot / bam / crak. */
  suits: readonly Suit[];
  /** Ranks 1..suitedRanks per suit. */
  suitedRanks: number;
  /** Copies of each individual suited tile (rank+suit). */
  suitedCopiesPerTile: number;
  /** Number of distinct winds (E/S/W/N = 4). */
  windCount: number;
  /** Copies of each wind. */
  windCopiesPerTile: number;
  /** Dragon colours present. */
  dragons: readonly DragonColor[];
  /** Copies of each dragon colour. */
  dragonCopiesPerTile: number;
  /** Distinct Flower tiles, each unique (no duplicate copies unless raised). */
  flowerCount: number;
  /** Jokers in the wall. */
  jokerCount: number;
  /** When true, an exhausted wall is rebuilt + reshuffled instead of running
   *  out (tutorials, or an explicit endless variant). Primary play is finite. */
  reshuffleWhenEmpty: boolean;
};

/**
 * The canonical American Mahjong wall (158 tiles). This is the inventory of
 * record and the target the primary mode grows toward:
 *   108 numbered (3 suits × 9 ranks × 4)  +  16 winds  +  12 dragons
 *   +  12 flowers  +  10 jokers  =  158
 * Values are configurable; change them here, never in the engine.
 */
export const STANDARD_TILE_INVENTORY: TileInventoryConfig = {
  suits: ["dot", "bam", "crak"],
  suitedRanks: 9,
  suitedCopiesPerTile: 4,
  windCount: 4,
  windCopiesPerTile: 4,
  dragons: ["red", "green", "white"],
  dragonCopiesPerTile: 4,
  flowerCount: 12,
  jokerCount: 10,
  reshuffleWhenEmpty: false,
};

/**
 * The wall the primary game mode actually deals from today. It is a strict
 * subset of the canonical wall, restricted to the tile families the engine has
 * working combination rules for: numbered suits at ranks 1–3 (so the two-stage
 * 1·2·3 run stays unambiguous), Dragons, and Jokers. Winds, Flowers and ranks
 * 4–9 are fully specified in STANDARD_TILE_INVENTORY and switch on here once
 * their rules land — a config change, not an engine rewrite.
 *
 * Copies-per-tile match the canonical 4; the wall is genuinely finite.
 */
export const PRIMARY_WALL: TileInventoryConfig = {
  suits: ["dot", "bam", "crak"],
  suitedRanks: 3,
  suitedCopiesPerTile: 4,
  windCount: 0,
  windCopiesPerTile: 4,
  dragons: ["red", "green", "white"],
  dragonCopiesPerTile: 4,
  flowerCount: 0,
  jokerCount: 4,
  reshuffleWhenEmpty: false,
};

/**
 * Learning hands use a forgiving wall that rebuilds when emptied — a tutorial
 * should teach the merge rules, not end because the (deliberately small,
 * family-restricted) wall ran dry. The finite-wall strategy is a primary-mode
 * concept the player meets after onboarding.
 */
export const LEARNING_WALL: TileInventoryConfig = {
  ...PRIMARY_WALL,
  jokerCount: 2,
  reshuffleWhenEmpty: true,
};

/** Total tiles a wall configuration holds (the "known inventory" count). */
export function wallSize(cfg: TileInventoryConfig): number {
  return (
    cfg.suits.length * cfg.suitedRanks * cfg.suitedCopiesPerTile +
    cfg.windCount * cfg.windCopiesPerTile +
    cfg.dragons.length * cfg.dragonCopiesPerTile +
    cfg.flowerCount +
    cfg.jokerCount
  );
}

/**
 * Expand a wall config into the flat multiset of concrete tile ids it deals.
 * Only families that map to a playable TileTypeId are emitted (suited, dragon,
 * joker); winds and flowers are counted by wallSize for the canonical total but
 * are not yet dealt (they have no combination rules), so a wall used for play
 * must set windCount / flowerCount to 0.
 */
export function expandWall(cfg: TileInventoryConfig): TileTypeId[] {
  if (cfg.windCount > 0 || cfg.flowerCount > 0) {
    throw new Error(
      "expandWall: winds and flowers are not yet playable; set windCount/flowerCount to 0 for a dealt wall.",
    );
  }
  const tiles: TileTypeId[] = [];
  for (const suit of cfg.suits) {
    for (let rank = 1; rank <= cfg.suitedRanks; rank++) {
      const id = `${suit}-${rank}` as TileTypeId;
      for (let c = 0; c < cfg.suitedCopiesPerTile; c++) tiles.push(id);
    }
  }
  for (const dragon of cfg.dragons) {
    const id = `dragon-${dragon}` as TileTypeId;
    for (let c = 0; c < cfg.dragonCopiesPerTile; c++) tiles.push(id);
  }
  for (let c = 0; c < cfg.jokerCount; c++) tiles.push("joker");
  return tiles;
}

/**
 * Build a fresh, shuffled finite wall from a config, optionally restricted to an
 * allowed tile-family set (learning hands). Deterministic given the RNG state.
 */
export function buildWall(
  cfg: TileInventoryConfig,
  rngState: number,
  allowed?: ReadonlySet<TileTypeId>,
): { wall: TileTypeId[]; rngState: number } {
  let tiles = expandWall(cfg);
  if (allowed) tiles = tiles.filter((t) => allowed.has(t));
  const { result, state } = shuffle(tiles, rngState);
  return { wall: result, rngState: state };
}
