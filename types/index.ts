// ---------------------------------------------------------------------------
// CRAK! core domain types
// ---------------------------------------------------------------------------

export type Suit = "dot" | "bam" | "crak";
export type Rank = 1 | 2 | 3;
export type DragonColor = "red" | "green" | "white";

export type LooseTileKind = "number" | "dragon" | "joker";
export type CompletedSetKind = "pair" | "pung" | "run";

/**
 * A single game piece. Loose tiles are the raw draws; completed tiles are the
 * assembled sets (pair / pung / run). We reuse suit/rank/dragon to describe the
 * identity of a completed set as well:
 *   - pair/pung of a number: { setKind, suit, rank }
 *   - pair/pung of a dragon: { setKind, dragon }
 *   - run of a suit:         { setKind: "run", suit }  (implicitly 1-2-3)
 */
export type Tile = {
  id: string;
  state: "loose" | "completed";
  suit?: Suit;
  rank?: Rank;
  dragon?: DragonColor;
  isJoker?: boolean;
  setKind?: CompletedSetKind;
  /** True once this completed set has been counted toward a target slot. */
  usedForTarget?: boolean;
  /** True when a joker was consumed to complete this set. */
  usedJoker?: boolean;
};

/** Stable identifiers for the loose tile catalogue. */
export type TileTypeId =
  | "dot-1"
  | "dot-2"
  | "dot-3"
  | "bam-1"
  | "bam-2"
  | "bam-3"
  | "crak-1"
  | "crak-2"
  | "crak-3"
  | "dragon-red"
  | "dragon-green"
  | "dragon-white"
  | "joker";

export type Direction = "up" | "down" | "left" | "right";

/** 16-cell board, row-major. null = empty cell. */
export type Board = (Tile | null)[];

export const BOARD_SIZE = 4;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

// ---------------------------------------------------------------------------
// Combination events (for scoring, sound, statistics)
// ---------------------------------------------------------------------------

export type CombineEventType =
  | "pair"
  | "pung"
  | "dragon-pair"
  | "dragon-pung"
  | "run";

export type CombineEvent = {
  type: CombineEventType;
  tile: Tile;
  usedJoker: boolean;
};

// ---------------------------------------------------------------------------
// Move / animation result
// ---------------------------------------------------------------------------

/** A tile that survives the move and slides from one cell to another. */
export type Slide = { id: string; from: number; to: number };

/** A source tile consumed by a combination, sliding into the result cell. */
export type Merge = { id: string; into: string; at: number };

export type MoveResult = {
  board: Board;
  changed: boolean;
  events: CombineEvent[];
  slides: Slide[];
  merges: Merge[];
};

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export type TargetRequirementKind =
  | "any-pair"
  | "number-pung"
  | "suited-run"
  | "dragon-set"
  | "suit-set" // a pung or run of a specific suit
  | "suit-run" // a run of a specific suit
  | "any-set"; // any pung or run

export type TargetRequirement = {
  id: string;
  kind: TargetRequirementKind;
  /** For suit-specific requirements. */
  suit?: Suit;
  /** Human-readable label, e.g. "DOT SET". */
  label: string;
  /** Filled by the id of the board tile that satisfied it. */
  filledBy?: string;
};

export type TargetPattern = {
  id: string;
  name: string;
  requirements: TargetRequirement[];
};

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GameStatus = "playing" | "won-hand" | "game-over";

export type Stats = {
  gamesPlayed: number;
  bestScore: number;
  totalScore: number; // for average
  handsCompleted: number;
  highestRound: number;
  totalPairs: number;
  totalPungs: number;
  totalRuns: number;
  totalDragonSets: number;
  longestGameMs: number;
  totalPlayTimeMs: number;
  suitCounts: Record<Suit, number>;
};

export type Settings = {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  theme: "light" | "dark";
  reducedMotion: boolean;
  highContrast: boolean;
  jokersEnabled: boolean;
  tutorialSeen: boolean;
};

export type GameState = {
  board: Board;
  score: number;
  round: number;
  multiplier: number;
  target: TargetPattern;
  status: GameStatus;
  /** Fair-bag draw pool state. */
  bag: TileTypeId[];
  /** Deterministic RNG state (mulberry32 seed). */
  rngState: number;
  /** Recent spawns, used to avoid runaway repeats. */
  recentSpawns: TileTypeId[];
  /** One free undo per game. */
  undoAvailable: boolean;
  undoSnapshot: GameSnapshot | null;
  elapsedMs: number;
  handsCompleted: number;
  setsCreated: number;
  /** running tally of suit usage for "most-used suit". */
  suitCounts: Record<Suit, number>;
};

/** Minimal snapshot captured before a move to support a single undo. */
export type GameSnapshot = {
  board: Board;
  score: number;
  round: number;
  multiplier: number;
  target: TargetPattern;
  status: GameStatus;
  bag: TileTypeId[];
  rngState: number;
  recentSpawns: TileTypeId[];
  elapsedMs: number;
  handsCompleted: number;
  setsCreated: number;
  suitCounts: Record<Suit, number>;
};
