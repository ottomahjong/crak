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

  /** Spawn model: exactly ONE new tile enters after every VALID swipe (a swipe
   *  that moved a tile, combined tiles, or advanced a partial set). Swipes that
   *  change nothing never spawn. Combining a swipe nets zero tiles (it removes
   *  what it fuses, then one enters), so skilled play keeps the board flowing. */
  SPAWN_PER_VALID_SWIPE: true,

  /** How many tiles the board starts with. Kept low because every swipe now
   *  adds a tile, so the board fills from play rather than from the initial deal. */
  INITIAL_TILES: 3,
  INITIAL_TILES_BEGINNER: 3,

  /** Endless round at which advanced play unlocks: Kongs & Quints become
   *  combinable and Kong/Quint target hands may be dealt. */
  ADVANCED_ROUND: 7,

  /** Free undos per game (precise placement → accidental swipes are cheap). */
  UNDO_COUNT: 3,
} as const;
