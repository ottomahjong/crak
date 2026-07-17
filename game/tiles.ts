import type {
  DragonColor,
  Rank,
  Suit,
  Tile,
  TileTypeId,
} from "@/types";

// ---------------------------------------------------------------------------
// Tile identity + construction helpers
// ---------------------------------------------------------------------------

export const SUITS: Suit[] = ["dot", "bam", "crak"];
export const RANKS: Rank[] = [1, 2, 3];
export const DRAGONS: DragonColor[] = ["red", "green", "white"];

export const ALL_TILE_TYPES: TileTypeId[] = [
  "dot-1",
  "dot-2",
  "dot-3",
  "bam-1",
  "bam-2",
  "bam-3",
  "crak-1",
  "crak-2",
  "crak-3",
  "dragon-red",
  "dragon-green",
  "dragon-white",
  "joker",
];

let idCounter = 0;
/** Monotonic unique id for tiles. Prefixed so ids are readable in debugging. */
export function newTileId(prefix = "t"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function makeLooseFromType(type: TileTypeId, id = newTileId()): Tile {
  if (type === "joker") {
    return { id, state: "loose", isJoker: true };
  }
  if (type.startsWith("dragon-")) {
    const dragon = type.split("-")[1] as DragonColor;
    return { id, state: "loose", dragon };
  }
  const [suit, rankStr] = type.split("-");
  return {
    id,
    state: "loose",
    suit: suit as Suit,
    rank: Number(rankStr) as Rank,
  };
}

export function tileTypeOf(tile: Tile): TileTypeId | null {
  if (tile.state !== "loose") return null;
  if (tile.isJoker) return "joker";
  if (tile.dragon) return `dragon-${tile.dragon}` as TileTypeId;
  if (tile.suit && tile.rank) return `${tile.suit}-${tile.rank}` as TileTypeId;
  return null;
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export const isLoose = (t: Tile) => t.state === "loose";
export const isCompleted = (t: Tile) => t.state === "completed";
export const isJoker = (t: Tile) => t.state === "loose" && !!t.isJoker;
export const isLooseNumber = (t: Tile) =>
  t.state === "loose" && !t.isJoker && !!t.suit && !!t.rank;
export const isLooseDragon = (t: Tile) =>
  t.state === "loose" && !t.isJoker && !!t.dragon;

export const isPair = (t: Tile) => t.state === "completed" && t.setKind === "pair";
export const isPung = (t: Tile) => t.state === "completed" && t.setKind === "pung";
export const isRun = (t: Tile) => t.state === "completed" && t.setKind === "run";
export const isDragonSet = (t: Tile) =>
  t.state === "completed" && !!t.dragon && (t.setKind === "pair" || t.setKind === "pung");
export const isNumberSet = (t: Tile) =>
  t.state === "completed" && !!t.suit && (t.setKind === "pair" || t.setKind === "pung" || t.setKind === "run");

// ---------------------------------------------------------------------------
// Completed-set constructors
// ---------------------------------------------------------------------------

export function makePair(
  identity: { suit: Suit; rank: Rank } | { dragon: DragonColor },
  usedJoker = false,
  id = newTileId("pair"),
): Tile {
  return { id, state: "completed", setKind: "pair", usedJoker, ...identity };
}

export function makePung(
  identity: { suit: Suit; rank: Rank } | { dragon: DragonColor },
  usedJoker = false,
  id = newTileId("pung"),
): Tile {
  return { id, state: "completed", setKind: "pung", usedJoker, ...identity };
}

export function makeRun(suit: Suit, usedJoker = false, id = newTileId("run")): Tile {
  return { id, state: "completed", setKind: "run", suit, usedJoker };
}

// ---------------------------------------------------------------------------
// Accessible labels
// ---------------------------------------------------------------------------

const SUIT_LABEL: Record<Suit, string> = { dot: "Dot", bam: "Bam", crak: "Crak" };
const DRAGON_LABEL: Record<DragonColor, string> = {
  red: "Red Dragon",
  green: "Green Dragon",
  white: "White Dragon",
};

export function tileLabel(tile: Tile): string {
  if (tile.state === "loose") {
    if (tile.isJoker) return "Joker";
    if (tile.dragon) return DRAGON_LABEL[tile.dragon];
    if (tile.suit && tile.rank) return `${tile.rank} ${SUIT_LABEL[tile.suit]}`;
    return "Tile";
  }
  const kind = tile.setKind === "pair" ? "Pair" : tile.setKind === "pung" ? "Pung" : "Run";
  if (tile.setKind === "run" && tile.suit) return `${SUIT_LABEL[tile.suit]} Run`;
  if (tile.dragon) return `${DRAGON_LABEL[tile.dragon]} ${kind}`;
  if (tile.suit && tile.rank) return `${SUIT_LABEL[tile.suit]} ${tile.rank} ${kind}`;
  return kind;
}

/** Short label used on composite tiles, e.g. "PAIR", "PUNG", "RUN". */
export function setKindLabel(tile: Tile): string {
  if (tile.setKind === "pair") return "PAIR";
  if (tile.setKind === "pung") return "PUNG";
  if (tile.setKind === "run") return "RUN";
  return "";
}
