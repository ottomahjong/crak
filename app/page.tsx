"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/hooks/useGame";
import { Home } from "@/components/screens/Home";
import { Pause } from "@/components/screens/Pause";
import { Statistics } from "@/components/screens/Statistics";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { GameScreen } from "@/components/game/GameScreen";
import { DebugPanel } from "@/components/game/DebugPanel";

type Screen = "home" | "game" | "pause" | "stats" | "settings";

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

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (process.env.NODE_ENV !== "production") return true;
    return new URLSearchParams(window.location.search).has("debug");
  }, []);

  const startLearning = () => {
    g.updateSettings({ tutorialSeen: true });
    g.startLearningGame();
    setScreen("game");
  };
  const play = () => {
    // Mark onboarding acknowledged so "Skip — just play" doesn't nag later.
    if (!g.settings.tutorialSeen) g.updateSettings({ tutorialSeen: true });
    g.startNewGame();
    setScreen("game");
  };
  const cont = () => {
    g.continueGame();
    setScreen("game");
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
          tutorialSeen={g.settings.tutorialSeen}
          onPlay={play}
          onContinue={cont}
          onLearn={startLearning}
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
          onHowTo={startLearning}
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
          onReplayTutorial={startLearning}
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

      {debugEnabled && screen === "game" && g.game && (
        <DebugPanel game={g.game} onApply={g.replaceGame} metrics={g.evalMetrics} />
      )}
    </main>
  );
}
