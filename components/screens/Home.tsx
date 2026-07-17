"use client";

import { Wordmark } from "@/components/ui/Wordmark";

type Props = {
  best: number;
  hasSave: boolean;
  onPlay: () => void;
  onContinue: () => void;
  onTutorial: () => void;
  onStats: () => void;
  onSettings: () => void;
};

export function Home({ best, hasSave, onPlay, onContinue, onTutorial, onStats, onSettings }: Props) {
  return (
    <div className="screen home">
      <div className="home__top">
        <Wordmark />
        <p className="home__subtitle">A tiny mahjong puzzle</p>
        {best > 0 && <p className="home__best">Best {best.toLocaleString()}</p>}
      </div>

      <div className="home__actions">
        {hasSave && (
          <button className="btn btn--primary btn--lg" onClick={onContinue}>
            Continue
          </button>
        )}
        <button className={`btn btn--lg ${hasSave ? "" : "btn--primary"}`} onClick={onPlay}>
          {hasSave ? "New game" : "Play"}
        </button>
        <div className="home__minor">
          <button className="btn btn--ghost" onClick={onTutorial}>
            How to play
          </button>
          <button className="btn btn--ghost" onClick={onStats}>
            Statistics
          </button>
          <button className="btn btn--ghost" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>

      <p className="home__footer">Swipe · Combine · Complete the hand</p>
    </div>
  );
}
