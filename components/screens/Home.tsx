"use client";

import { Wordmark } from "@/components/ui/Wordmark";

type Props = {
  best: number;
  hasSave: boolean;
  tutorialSeen: boolean;
  onPlay: () => void;
  onContinue: () => void;
  onLearn: () => void;
  onStats: () => void;
  onSettings: () => void;
};

export function Home({
  best,
  hasSave,
  tutorialSeen,
  onPlay,
  onContinue,
  onLearn,
  onStats,
  onSettings,
}: Props) {
  const isNew = !tutorialSeen;

  return (
    <div className="screen home">
      <div className="home__top">
        <Wordmark />
        <p className="home__subtitle">A tiny mahjong puzzle</p>
        {best > 0 && <p className="home__best">Best {best.toLocaleString()}</p>}
      </div>

      <div className="home__actions">
        {isNew ? (
          <>
            {/* First-time players: learning is the primary call to action. */}
            <button className="btn btn--primary btn--lg" onClick={onLearn}>
              Learn to Play
            </button>
            <button className="btn btn--lg" onClick={onPlay}>
              Skip — just play
            </button>
          </>
        ) : (
          <>
            {hasSave && (
              <button className="btn btn--primary btn--lg" onClick={onContinue}>
                Continue
              </button>
            )}
            <button className={`btn btn--lg ${hasSave ? "" : "btn--primary"}`} onClick={onPlay}>
              {hasSave ? "New game" : "Play"}
            </button>
            <button className="btn btn--lg" onClick={onLearn}>
              Learn to Play
            </button>
          </>
        )}

        <div className="home__minor">
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
