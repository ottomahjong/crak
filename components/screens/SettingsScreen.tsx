"use client";

import { useState } from "react";
import type { Settings } from "@/types";
import { resetAllData } from "@/lib/storage";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReplayTutorial: () => void;
  onResetData: () => void;
  onBack: () => void;
};

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="setting-row">
      <span className="setting-row__text">
        <span className="setting-row__label">{label}</span>
        {hint && <span className="setting-row__hint">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? "switch--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </label>
  );
}

export function SettingsScreen({ settings, onChange, onReplayTutorial, onResetData, onBack }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="screen menu-screen">
      <header className="menu-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2>Settings</h2>
      </header>

      <div className="settings-list">
        <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => onChange({ sound: v })} />
        <Toggle label="Haptics" checked={settings.haptics} onChange={(v) => onChange({ haptics: v })} hint="Vibration where supported" />
        <Toggle
          label="Dark appearance"
          checked={settings.theme === "dark"}
          onChange={(v) => onChange({ theme: v ? "dark" : "light" })}
        />
        <Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
        <Toggle label="High-contrast labels" checked={settings.highContrast} onChange={(v) => onChange({ highContrast: v })} />
        <Toggle
          label="Jokers"
          checked={settings.jokersEnabled}
          onChange={(v) => onChange({ jokersEnabled: v })}
          hint="Wild tiles that complete a set"
        />

        <button className="btn btn--block" onClick={onReplayTutorial}>
          Replay tutorial
        </button>

        {confirming ? (
          <div className="confirm">
            <p className="confirm__q">Erase all local data — stats, settings and saved game?</p>
            <div className="confirm__row">
              <button
                className="btn btn--danger"
                onClick={() => {
                  resetAllData();
                  onResetData();
                  setConfirming(false);
                }}
              >
                Erase everything
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn--block btn--danger-ghost" onClick={() => setConfirming(true)}>
            Reset all local data
          </button>
        )}
      </div>
    </div>
  );
}
