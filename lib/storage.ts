import type { GameState, Settings, Stats, TileTypeId } from "@/types";
import { CONFIG } from "@/game/config";
import { buildWall, PRIMARY_WALL, LEARNING_WALL } from "@/game/inventory";

// ---------------------------------------------------------------------------
// Versioned local storage. No accounts, no backend — everything lives on the
// device. Malformed / outdated payloads are handled defensively: statistics are
// preserved when possible and a corrupt active game is discarded.
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;
const KEY = "crak:v1";

type Persisted = {
  version: number;
  settings: Settings;
  stats: Stats;
  active: GameState | null;
};

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: false,
  haptics: true,
  theme: "dark",
  reducedMotion: false,
  highContrast: false,
  jokersEnabled: true,
  tutorialSeen: false,
  guidedPlay: true,
};

export const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  bestScore: 0,
  totalScore: 0,
  handsCompleted: 0,
  highestRound: 1,
  totalPairs: 0,
  totalPungs: 0,
  totalRuns: 0,
  totalDragonSets: 0,
  longestGameMs: 0,
  totalPlayTimeMs: 0,
  suitCounts: { dot: 0, bam: 0, crak: 0 },
};

function isBrowser() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function read(): Persisted {
  if (!isBrowser()) {
    return { version: SCHEMA_VERSION, settings: DEFAULT_SETTINGS, stats: DEFAULT_STATS, active: null };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return { version: SCHEMA_VERSION, settings: DEFAULT_SETTINGS, stats: DEFAULT_STATS, active: null };
    }
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return migrate(parsed);
  } catch {
    return { version: SCHEMA_VERSION, settings: DEFAULT_SETTINGS, stats: DEFAULT_STATS, active: null };
  }
}

function migrate(data: Partial<Persisted>): Persisted {
  // Merge with defaults so missing keys never crash the app.
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
  const stats: Stats = {
    ...DEFAULT_STATS,
    ...(data.stats ?? {}),
    suitCounts: { ...DEFAULT_STATS.suitCounts, ...(data.stats?.suitCounts ?? {}) },
  };
  let active: GameState | null = null;
  if (data.active && validActive(data.active)) active = migrateActive(data.active);
  return { version: SCHEMA_VERSION, settings, stats, active };
}

function validActive(g: unknown): g is GameState {
  if (!g || typeof g !== "object") return false;
  const s = g as GameState;
  return Array.isArray(s.board) && s.board.length === 16 && typeof s.score === "number" && !!s.target;
}

/**
 * Bring an active game forward to the current schema. The board/tile format is
 * unchanged by the one-step movement update — a saved game stays playable — but
 * older saves predate the undo-stack and spawn-cadence fields, so we fill them
 * in (granting a fresh set of undos) rather than discarding the game.
 */
function migrateActive(g: GameState): GameState {
  const legacy = g as GameState & {
    undoAvailable?: boolean;
    undoSnapshot?: unknown;
    bag?: TileTypeId[];
    movesSinceSpawn?: number;
  };
  // Finite-wall migration: saves that predate the wall carried an infinite
  // "bag". Rebuild a proper finite wall (seeded from the saved RNG) so an old
  // game continues under the new inventory rules rather than being discarded.
  let wall = g.wall;
  let wallStart = g.wallStart;
  if (!Array.isArray(wall)) {
    const cfg = g.learning ? LEARNING_WALL : PRIMARY_WALL;
    const built = buildWall(cfg, (g.rngState >>> 0) || 1);
    wall = built.wall;
    wallStart = built.wall.length;
  } else if (typeof wallStart !== "number") {
    wallStart = wall.length;
  }
  return {
    ...g,
    wall,
    wallStart,
    undosRemaining: typeof g.undosRemaining === "number" ? g.undosRemaining : CONFIG.UNDO_COUNT,
    undoStack: Array.isArray(g.undoStack) ? g.undoStack : [],
    idleSwipes: typeof g.idleSwipes === "number" ? g.idleSwipes : 0,
    // drop legacy fields if present
    ...(legacy.undoAvailable !== undefined ? { undoAvailable: undefined } : {}),
    ...(legacy.bag !== undefined ? { bag: undefined } : {}),
    ...(legacy.movesSinceSpawn !== undefined ? { movesSinceSpawn: undefined } : {}),
  } as GameState;
}

function write(next: Persisted) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full / private mode: fail silently, game still runs in memory.
  }
}

// --- Public API ------------------------------------------------------------

export function loadSettings(): Settings {
  return read().settings;
}

export function saveSettings(settings: Settings) {
  const cur = read();
  write({ ...cur, settings });
}

export function loadStats(): Stats {
  return read().stats;
}

export function saveStats(stats: Stats) {
  const cur = read();
  write({ ...cur, stats });
}

export function loadActiveGame(): GameState | null {
  return read().active;
}

export function saveActiveGame(active: GameState | null) {
  const cur = read();
  write({ ...cur, active });
}

/** Wipe all local data (settings, stats, active game). */
export function resetAllData() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export { KEY as STORAGE_KEY };
