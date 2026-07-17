"use client";

import { useState } from "react";

type Props = {
  onResume: () => void;
  onRestart: () => void;
  onHowTo: () => void;
  onSettings: () => void;
  onMenu: () => void;
};

export function Pause({ onResume, onRestart, onHowTo, onSettings, onMenu }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="screen sheet-screen" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="sheet">
        <h2 className="sheet__title">Paused</h2>
        <div className="sheet__actions">
          <button className="btn btn--primary btn--lg" onClick={onResume}>
            Resume
          </button>

          {confirming ? (
            <div className="confirm">
              <p className="confirm__q">Restart this game? Progress is lost.</p>
              <div className="confirm__row">
                <button className="btn btn--danger" onClick={onRestart}>
                  Restart
                </button>
                <button className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn" onClick={() => setConfirming(true)}>
              Restart
            </button>
          )}

          <button className="btn" onClick={onHowTo}>
            How to play
          </button>
          <button className="btn" onClick={onSettings}>
            Settings
          </button>
          <button className="btn btn--ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
