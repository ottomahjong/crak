import type { CombineEvent, GameState, Stats, Suit } from "@/types";

// ---------------------------------------------------------------------------
// Statistics aggregation. Kept pure; the hook persists the result.
// ---------------------------------------------------------------------------

export function applyEventsToStats(stats: Stats, events: CombineEvent[]): Stats {
  const next: Stats = { ...stats, suitCounts: { ...stats.suitCounts } };
  for (const e of events) {
    switch (e.type) {
      case "pair":
        next.totalPairs += 1;
        break;
      case "pung":
        next.totalPungs += 1;
        break;
      case "run":
        next.totalRuns += 1;
        break;
      case "dragon-pair":
      case "dragon-pung":
        next.totalDragonSets += 1;
        break;
    }
    const suit = e.tile.suit as Suit | undefined;
    if (suit) next.suitCounts[suit] += 1;
  }
  return next;
}

/** Fold a finished game's totals into lifetime stats. */
export function finalizeGame(stats: Stats, game: GameState): Stats {
  const next: Stats = { ...stats, suitCounts: { ...stats.suitCounts } };
  next.gamesPlayed += 1;
  next.totalScore += game.score;
  next.bestScore = Math.max(next.bestScore, game.score);
  next.handsCompleted += game.handsCompleted;
  next.highestRound = Math.max(next.highestRound, game.round);
  next.longestGameMs = Math.max(next.longestGameMs, game.elapsedMs);
  next.totalPlayTimeMs += game.elapsedMs;
  return next;
}

export function averageScore(stats: Stats): number {
  return stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;
}

export function mostUsedSuit(stats: Stats): Suit | null {
  const entries = Object.entries(stats.suitCounts) as [Suit, number][];
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : null;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
