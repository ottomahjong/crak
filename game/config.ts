// ---------------------------------------------------------------------------
// Central balancing / tuning configuration.
//
// Everything that governs "how a move feels" lives here so it can be tuned in
// one place rather than scattered across engine and components.
// ---------------------------------------------------------------------------

export const CONFIG = {
  /** Every swipe moves each eligible tile by exactly this many cells. */
  MOVE_DISTANCE_CELLS: 1,

  /** Minimum pointer travel (px) before a swipe registers. Higher = fewer
   *  accidental swipes; tuned for narrow iPhone screens. */
  SWIPE_THRESHOLD_PX: 26,

  /** Animation durations (ms). One-cell moves are short and controlled. */
  MOVE_MS: 130,
  MERGE_MS: 150,
  SPAWN_MS: 140,

  /** Delay before an idle Guided-Play hint appears (ms). */
  HINT_DELAY_MS: 1800,

  /** Spawn cadence: a new tile appears after this many *non-combining* valid
   *  swipes (combining moves never spawn — they already earn breathing room).
   *  Beginner (learning) mode is more forgiving. Chosen by simulation. */
  SPAWN_EVERY_MOVES: 2,
  SPAWN_EVERY_MOVES_BEGINNER: 3,

  /** How many tiles the board starts with (leaves lots of empty space so the
   *  player can correct placement mistakes). */
  INITIAL_TILES: 3,
  INITIAL_TILES_BEGINNER: 3,

  /** Free undos per game (precise placement → accidental swipes are cheap). */
  UNDO_COUNT: 3,
} as const;

export type MoveMode = "normal" | "beginner";

export function spawnEvery(mode: MoveMode): number {
  return mode === "beginner" ? CONFIG.SPAWN_EVERY_MOVES_BEGINNER : CONFIG.SPAWN_EVERY_MOVES;
}
