"use client";

import { useState } from "react";
import type { GameState, Stats } from "@/types";
import { mostUsedSuit } from "@/lib/stats";

type Props = {
  game: GameState;
  stats: Stats;
  onPlayAgain: () => void;
  onExit: () => void;
};

const SUIT_NAME: Record<string, string> = { dot: "Dots", bam: "Bams", crak: "Craks" };

export function GameOverOverlay({ game, stats, onPlayAgain, onExit }: Props) {
  const [shared, setShared] = useState<string | null>(null);
  const topSuit = mostUsedSuit({ ...stats, suitCounts: game.suitCounts });

  const hands = game.handsCompleted;
  const plural = hands === 1 ? "" : "s";
  const wallSpent = game.wall.length === 0;
  const headline = wallSpent ? "Wall cleared" : "No moves left";

  const shareText = `I completed ${hands} hand${plural} from one wall (${game.score.toLocaleString()} pts) in CRAK!`;

  const share = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: shareText, title: "CRAK!" });
        setShared("Shared");
        return;
      }
    } catch {
      /* user cancelled or unsupported */
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setShared("Copied to clipboard");
    } catch {
      setShared(shareText);
    }
  };

  const rows: [string, string][] = [
    ["Final score", game.score.toLocaleString()],
    ["Best score", Math.max(stats.bestScore, game.score).toLocaleString()],
    ["Sets created", String(game.setsCreated)],
    ["Most-used suit", topSuit ? SUIT_NAME[topSuit] : "—"],
  ];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="overlay__card">
        <div className="gameover-word">{headline}</div>
        <div className="gameover-hands">
          <span className="gameover-hands__n">{hands}</span>
          <span className="gameover-hands__label">hand{plural} from one wall</span>
        </div>
        <dl className="summary">
          {rows.map(([k, v]) => (
            <div className="summary__row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="overlay__actions">
          <button className="btn btn--primary" onClick={onPlayAgain} autoFocus>
            Play again
          </button>
          <button className="btn" onClick={share}>
            Share score
          </button>
        </div>
        {shared && <p className="overlay__note" aria-live="polite">{shared}</p>}
        <button className="btn btn--ghost" onClick={onExit}>
          Main menu
        </button>
      </div>
    </div>
  );
}
