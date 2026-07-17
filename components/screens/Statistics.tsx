"use client";

import type { Stats } from "@/types";
import { averageScore, formatDuration, mostUsedSuit } from "@/lib/stats";

const SUIT_NAME: Record<string, string> = { dot: "Dots", bam: "Bams", crak: "Craks" };

export function Statistics({ stats, onBack }: { stats: Stats; onBack: () => void }) {
  const top = mostUsedSuit(stats);
  const rows: [string, string][] = [
    ["Games played", String(stats.gamesPlayed)],
    ["Best score", stats.bestScore.toLocaleString()],
    ["Average score", averageScore(stats).toLocaleString()],
    ["Hands completed", String(stats.handsCompleted)],
    ["Highest round", String(stats.highestRound)],
    ["Total pairs", String(stats.totalPairs)],
    ["Total pungs", String(stats.totalPungs)],
    ["Total runs", String(stats.totalRuns)],
    ["Total dragon sets", String(stats.totalDragonSets)],
    ["Most-used suit", top ? SUIT_NAME[top] : "—"],
    ["Longest game", formatDuration(stats.longestGameMs)],
    ["Total play time", formatDuration(stats.totalPlayTimeMs)],
  ];

  return (
    <div className="screen menu-screen">
      <header className="menu-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <BackArrow />
        </button>
        <h2>Statistics</h2>
      </header>
      <dl className="summary summary--full">
        {rows.map(([k, v]) => (
          <div className="summary__row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
