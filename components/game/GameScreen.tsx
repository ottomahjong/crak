"use client";

import { useEffect, useMemo, useState } from "react";
import type { UseGame } from "@/hooks/useGame";
import { useKeyboard, useSwipe } from "@/hooks/useSwipe";
import { Board } from "./Board";
import { TargetHand } from "./TargetHand";
import { TopBar } from "./TopBar";
import { MahjOverlay } from "./MahjOverlay";
import { GameOverOverlay } from "./GameOverOverlay";
import { HowSetsWork } from "./HowSetsWork";
import { LearningIntro } from "./LearningIntro";

type Props = {
  g: UseGame;
  onPause: () => void;
  onExit: () => void;
  onOpenStats: () => void;
};

const EDGE_TEXT: Record<string, string> = {
  right: "the right",
  left: "the left",
  up: "the top",
  down: "the bottom",
};

export function GameScreen({ g, onPause, onExit, onOpenStats }: Props) {
  const { game, settings, stats } = g;
  const [showHelp, setShowHelp] = useState(false);
  const learning = !!game?.learning;
  const enabled =
    !!game && game.status === "playing" && g.overlay === null && !g.learningIntro && !showHelp;

  const boardRef = useSwipe<HTMLDivElement>({ onSwipe: g.doMove, enabled });
  useKeyboard(g.doMove, enabled);

  useEffect(() => {
    g.beginTiming();
    return () => g.pauseTiming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hintIds = useMemo(
    () => new Set(g.hint?.ids ?? []),
    [g.hint],
  );

  if (!game) return null;

  // First-time spawn callout: only during the first few swipes of a game.
  const showSpawnCallout = g.spawnEntry != null && g.swipeCount <= 3;

  return (
    <div className="screen game-screen">
      <TopBar
        score={game.score}
        best={Math.max(stats.bestScore, game.score)}
        round={game.round}
        multiplier={game.multiplier}
        onPause={onPause}
      />

      <TargetHand target={game.target} learning={learning} onExplainOpen={g.noteHelpOpened} />

      <div className="board-wrap">
        <Board
          ref={boardRef}
          board={game.board}
          ghosts={g.ghosts}
          newTileIds={g.newTileIds}
          combinedIds={g.combinedIds}
          hiddenSpawnId={g.hiddenSpawnId}
          spawnEntry={g.spawnEntry}
          hintIds={hintIds}
          showLearningLabels={learning}
          highContrast={settings.highContrast}
          reducedMotion={settings.reducedMotion}
        />
      </div>

      {/* Guided-play suggestion + status line. */}
      <div className="status-row" aria-live="polite">
        {g.message ? (
          <span className="status-msg">{g.message}</span>
        ) : g.hint && settings.guidedPlay ? (
          <span className="status-hint">{g.hint.text}</span>
        ) : showSpawnCallout ? (
          <span className="status-hint">A new tile entered from {EDGE_TEXT[g.spawnEntry!]}.</span>
        ) : null}
      </div>

      <div className="game-controls">
        <button
          className="ctrl-btn"
          onClick={g.doUndo}
          disabled={!game.undoAvailable}
          aria-label="Undo last move"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M9 7 L4 12 L9 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 12 H14 a6 6 0 0 1 0 12 H11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Undo{game.undoAvailable ? "" : " ✕"}
        </button>
        <button
          className="ctrl-btn"
          onClick={() => {
            g.noteHelpOpened();
            setShowHelp(true);
          }}
          aria-label="How sets work"
        >
          How to play
        </button>
        <button className="ctrl-btn" onClick={onPause} aria-label="Menu">
          Menu
        </button>
      </div>

      {g.learningIntro && (
        <LearningIntro stage={g.learningIntro} onStart={g.dismissLearningIntro} />
      )}
      {showHelp && <HowSetsWork onClose={() => setShowHelp(false)} />}
      {g.overlay === "mahj" && g.handSummary && (
        <MahjOverlay
          bonus={g.handSummary.bonus}
          round={game.round}
          learning={game.learning}
          onContinue={g.continueAfterHand}
        />
      )}
      {g.overlay === "gameover" && (
        <GameOverOverlay
          game={game}
          stats={stats}
          onPlayAgain={g.startNewGame}
          onExit={onExit}
        />
      )}
    </div>
  );
}
