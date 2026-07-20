// ---------------------------------------------------------------------------
// CRAK! core domain types
// ---------------------------------------------------------------------------

export type Suit = "dot" | "bam" | "crak";
export type Rank = 1 | 2 | 3;
export type DragonColor = "red" | "green" | "white";

export type LooseTileKind = "number" | "dragon" | "joker";
/**
 * "partial" is a two-tile partial run (1·2 or 2·3 of one suit) — the visible
 * intermediate step toward a run, exactly as a pair is the step toward a pung.
 * "kong" (4 of a kind) and "quint" (5 of a kind) extend a pung on advanced
 * levels: pung + match → kong, kong + match → quint.
 */
export type CompletedSetKind = "pair" | "pung" | "kong" | "quint" | "run" | "partial";

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
  /** For setKind "partial": the two ranks held, [1,2] or [2,3]. */
  partRanks?: [Rank, Rank];
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
  | "kong"
  | "quint"
  | "dragon-pair"
  | "dragon-pung"
  | "dragon-kong"
  | "partial-run"
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
  | "number-kong" // four of a kind (advanced)
  | "number-quint" // five of a kind (advanced)
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
  /** Plain-language label shown first during learning, e.g. "TWO MATCHING TILES". */
  plain?: string;
  /** Filled by the id of the board tile that satisfied it. */
  filledBy?: string;
};

export type TargetPattern = {
  id: string;
  name: string;
  requirements: TargetRequirement[];
};

/** A target hand is just a target pattern; alias kept for the solvability API. */
export type TargetHand = TargetPattern;

/** A future draw is identified by its loose-tile type. */
export type TileDefinition = TileTypeId;

// ---------------------------------------------------------------------------
// Solvability analysis
// ---------------------------------------------------------------------------

/**
 * The verdict of the fairness checker: whether a target hand can still be
 * completed from the current board plus the tiles that can still arrive.
 */
export type SolvabilityResult = {
  /** True when every unfilled requirement has a feasible recipe. */
  solvable: boolean;
  /** 0..1 — how comfortably achievable (1 = ample supply/space, low = tight). */
  confidence: number;
  /** Human-readable labels of requirements with no feasible recipe. */
  missingRequirements: string[];
  /** Real tiles (by type) still needed across the cheapest full assignment. */
  requiredTileCounts: Record<string, number>;
  /** Concrete reasons a hand is unsolvable or precarious. */
  blockingReasons: string[];
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
  /** True once the four-hand learning game has been completed (or skipped). */
  tutorialSeen: boolean;
  /** Idle hints + next-move suggestions. Defaults on for new players. */
  guidedPlay: boolean;
};

export type LearningStage = 1 | 2 | 3 | 4;

export type GameState = {
  board: Board;
  score: number;
  round: number;
  multiplier: number;
  target: TargetPattern;
  status: GameStatus;
  /** Set while playing the four-hand learning game; undefined in endless mode. */
  learning?: LearningStage;
  /** The finite tile wall: remaining tiles to be drawn, in draw order. */
  wall: TileTypeId[];
  /** Wall size at the start of the game (for the "tiles left" display). */
  wallStart: number;
  /** Deterministic RNG state (mulberry32 seed). */
  rngState: number;
  /** Recent spawns, used to avoid runaway repeats. */
  recentSpawns: TileTypeId[];
  /** Up to N free undos per game (see CONFIG.UNDO_COUNT). */
  undosRemaining: number;
  undoStack: GameSnapshot[];
  /** Consecutive valid swipes that made no set progress. Once the wall is
   *  empty, a run of these ends the game (stalemate — no way forward). */
  idleSwipes: number;
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
  learning?: LearningStage;
  wall: TileTypeId[];
  rngState: number;
  recentSpawns: TileTypeId[];
  idleSwipes: number;
  elapsedMs: number;
  handsCompleted: number;
  setsCreated: number;
  suitCounts: Record<Suit, number>;
};
