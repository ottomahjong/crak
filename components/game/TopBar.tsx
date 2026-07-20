"use client";

type Props = {
  score: number;
  best: number;
  round: number;
  multiplier: number;
  onPause: () => void;
  /** Tiles left in the finite wall, and the wall's starting size. */
  wallRemaining: number;
  wallTotal: number;
  /** Hide the wall meter during the (reshuffling) tutorial. */
  showWall: boolean;
};

export function TopBar({
  score,
  best,
  round,
  multiplier,
  onPause,
  wallRemaining,
  wallTotal,
  showWall,
}: Props) {
  const pct = wallTotal > 0 ? Math.max(0, Math.min(100, (wallRemaining / wallTotal) * 100)) : 0;
  const low = wallRemaining <= 8;
  return (
    <header className="topbar">
      <div className="topbar__row">
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
      </div>

      {showWall && (
        <div
          className={`wall-meter${low ? " wall-meter--low" : ""}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={wallTotal}
          aria-valuenow={wallRemaining}
          aria-label="Tiles left in the wall"
        >
          <div className="wall-meter__track">
            <div className="wall-meter__fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="wall-meter__label">
            {wallRemaining} {wallRemaining === 1 ? "tile" : "tiles"} left
          </span>
        </div>
      )}
    </header>
  );
}
