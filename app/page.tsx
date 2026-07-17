"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/hooks/useGame";
import { Home } from "@/components/screens/Home";
import { Pause } from "@/components/screens/Pause";
import { Statistics } from "@/components/screens/Statistics";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { Tutorial } from "@/components/screens/Tutorial";
import { GameScreen } from "@/components/game/GameScreen";
import { DebugPanel } from "@/components/game/DebugPanel";

type Screen = "home" | "game" | "pause" | "stats" | "settings" | "tutorial";

export default function Page() {
  const g = useGame();
  const [screen, setScreen] = useState<Screen>("home");
  const [returnTo, setReturnTo] = useState<Screen>("home");

  // Apply theme + reduced-motion to the document.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = g.settings.theme;
    root.classList.toggle("reduce-motion", g.settings.reducedMotion);
    root.classList.toggle("high-contrast", g.settings.highContrast);
  }, [g.settings.theme, g.settings.reducedMotion, g.settings.highContrast]);

  // First run → nudge into the tutorial once.
  useEffect(() => {
    if (g.ready && !g.settings.tutorialSeen) {
      setScreen((s) => (s === "home" ? "tutorial" : s));
    }
  }, [g.ready, g.settings.tutorialSeen]);

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (process.env.NODE_ENV !== "production") return true;
    return new URLSearchParams(window.location.search).has("debug");
  }, []);

  const play = () => {
    g.startNewGame();
    setScreen("game");
  };
  const cont = () => {
    g.continueGame();
    setScreen("game");
  };
  const finishTutorial = () => {
    g.updateSettings({ tutorialSeen: true });
    setScreen("home");
  };

  if (!g.ready) {
    return <div className="screen boot" aria-busy="true" />;
  }

  return (
    <main className="app-shell">
      {screen === "home" && (
        <Home
          best={g.stats.bestScore}
          hasSave={g.hasSave}
          onPlay={play}
          onContinue={cont}
          onTutorial={() => {
            setReturnTo("home");
            setScreen("tutorial");
          }}
          onStats={() => {
            setReturnTo("home");
            setScreen("stats");
          }}
          onSettings={() => {
            setReturnTo("home");
            setScreen("settings");
          }}
        />
      )}

      {screen === "game" && (
        <GameScreen
          g={g}
          onPause={() => setScreen("pause")}
          onExit={() => setScreen("home")}
          onOpenStats={() => {
            setReturnTo("game");
            setScreen("stats");
          }}
        />
      )}

      {screen === "pause" && (
        <Pause
          onResume={() => setScreen("game")}
          onRestart={() => {
            g.startNewGame();
            setScreen("game");
          }}
          onHowTo={() => {
            setReturnTo("pause");
            setScreen("tutorial");
          }}
          onSettings={() => {
            setReturnTo("pause");
            setScreen("settings");
          }}
          onMenu={() => {
            g.pauseTiming();
            setScreen("home");
          }}
        />
      )}

      {screen === "stats" && (
        <Statistics stats={g.stats} onBack={() => setScreen(returnTo)} />
      )}

      {screen === "settings" && (
        <SettingsScreen
          settings={g.settings}
          onChange={g.updateSettings}
          onReplayTutorial={() => {
            setReturnTo("settings");
            setScreen("tutorial");
          }}
          onResetData={() => {
            g.setStats({
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
            });
            setScreen("home");
          }}
          onBack={() => setScreen(returnTo)}
        />
      )}

      {screen === "tutorial" && <Tutorial onDone={finishTutorial} />}

      {debugEnabled && screen === "game" && g.game && (
        <DebugPanel game={g.game} onApply={g.replaceGame} />
      )}
    </main>
  );
}
