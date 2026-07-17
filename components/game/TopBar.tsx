"use client";

type Props = {
  score: number;
  best: number;
  round: number;
  multiplier: number;
  onPause: () => void;
};

export function TopBar({ score, best, round, multiplier, onPause }: Props) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onPause} aria-label="Pause">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
        </svg>
      </button>

      <div className="topbar__stats">
        <div className="stat">
          <span className="stat__label">SCORE</span>
          <span className="stat__value" aria-live="polite">{score.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat__label">BEST</span>
          <span className="stat__value">{best.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat__label">ROUND</span>
          <span className="stat__value">
            {round}
            <span className="stat__mult"> ×{multiplier}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
