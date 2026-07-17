"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Direction, GameState, Settings, Stats, Tile } from "@/types";
import {
  createInitialState,
  move as engineMove,
  undo as engineUndo,
  completeHand,
} from "@/game/state/game";
import {
  loadActiveGame,
  loadSettings,
  loadStats,
  saveActiveGame,
  saveSettings,
  saveStats,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
} from "@/lib/storage";
import { applyEventsToStats, finalizeGame } from "@/lib/stats";
import { playSound, setAudioEnabled, unlockAudio } from "@/lib/audio";
import { haptics, setHapticsEnabled } from "@/lib/haptics";

export type Ghost = { key: string; tile: Tile; index: number; to: number };
export type Overlay = null | "mahj" | "gameover";

export type UseGame = ReturnType<typeof useGame>;

const GHOST_MS = 190;

export function useGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [hasSave, setHasSave] = useState(false);
  const [ready, setReady] = useState(false);

  // Transient animation state.
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [newTileIds, setNewTileIds] = useState<Set<string>>(new Set());
  const [combinedIds, setCombinedIds] = useState<Set<string>>(new Set());
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [message, setMessage] = useState<string>("");
  const [handSummary, setHandSummary] = useState<{ bonus: number; empties: number } | null>(null);

  const playStart = useRef<number | null>(null);
  const busy = useRef(false);

  // --- boot -----------------------------------------------------------------
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setStats(loadStats());
    setAudioEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    const active = loadActiveGame();
    setHasSave(!!active && active.status !== "game-over");
    setReady(true);
  }, []);

  // Keep audio/haptics engines in sync with settings.
  useEffect(() => {
    setAudioEnabled(settings.sound);
    setHapticsEnabled(settings.haptics);
  }, [settings.sound, settings.haptics]);

  // --- time tracking --------------------------------------------------------
  const flushTime = useCallback((g: GameState): GameState => {
    if (playStart.current == null) return g;
    const now = Date.now();
    const delta = now - playStart.current;
    playStart.current = now;
    return { ...g, elapsedMs: g.elapsedMs + Math.max(0, delta) };
  }, []);

  const beginTiming = useCallback(() => {
    playStart.current = Date.now();
  }, []);
  const pauseTiming = useCallback(() => {
    setGame((g) => (g ? flushTime(g) : g));
    playStart.current = null;
  }, [flushTime]);

  // --- persistence helpers --------------------------------------------------
  const persistGame = useCallback((g: GameState) => {
    saveActiveGame(g);
    setHasSave(g.status !== "game-over");
  }, []);

  // --- lifecycle ------------------------------------------------------------
  const startNewGame = useCallback(() => {
    setGame((prev) => {
      // Finalize an abandoned in-progress game into lifetime stats.
      if (prev && prev.status !== "game-over" && prev.score > 0) {
        const finalized = finalizeGame(loadStats(), flushTime(prev));
        saveStats(finalized);
        setStats(finalized);
      }
      const fresh = createInitialState();
      persistGame(fresh);
      return fresh;
    });
    setOverlay(null);
    setGhosts([]);
    setNewTileIds(new Set());
    setMessage("");
    beginTiming();
  }, [beginTiming, flushTime, persistGame]);

  const continueGame = useCallback(() => {
    const active = loadActiveGame();
    if (active && active.status !== "game-over") {
      setGame(active);
      beginTiming();
    } else {
      startNewGame();
    }
  }, [beginTiming, startNewGame]);

  // --- audio / haptic feedback for a move -----------------------------------
  const feedback = useCallback(
    (events: ReturnType<typeof engineMove>["events"], filled: number) => {
      playSound("move");
      if (events.some((e) => e.type === "run")) playSound("run");
      else if (events.some((e) => e.type === "dragon-pung" || e.type === "dragon-pair")) playSound("dragon");
      else if (events.some((e) => e.type === "pung")) playSound("pung");
      else if (events.some((e) => e.type === "pair")) playSound("pair");

      if (filled > 0) playSound("target");

      if (events.length > 0) haptics.combine();
      else haptics.tap();
      if (filled > 0) haptics.target();
    },
    [],
  );

  // --- move -----------------------------------------------------------------
  const doMove = useCallback(
    (dir: Direction) => {
      unlockAudio();
      setGame((prev) => {
        if (!prev || prev.status !== "playing" || busy.current) return prev;
        const prevBoard = prev.board;
        const outcome = engineMove(prev, dir);
        if (!outcome.changed) return prev;

        // Build merge ghosts from the pre-move board.
        const prevById = new Map<string, Tile>();
        prevBoard.forEach((t, i) => {
          if (t) prevById.set(t.id, t);
        });
        const fromIndex = new Map<string, number>();
        prevBoard.forEach((t, i) => {
          if (t) fromIndex.set(t.id, i);
        });
        const nextGhosts: Ghost[] = outcome.merges
          .map((m, k) => {
            const tile = prevById.get(m.id);
            const from = fromIndex.get(m.id);
            if (!tile || from == null) return null;
            return { key: `${m.id}-${k}`, tile, index: from, to: m.at };
          })
          .filter(Boolean) as Ghost[];

        setGhosts(nextGhosts);
        // Kick the ghosts toward their destination next frame.
        requestAnimationFrame(() =>
          setGhosts((gs) => gs.map((g) => ({ ...g, index: g.to }))),
        );
        setTimeout(() => setGhosts([]), GHOST_MS);

        setNewTileIds(outcome.spawnedTile ? new Set([outcome.spawnedTile.id]) : new Set());
        setCombinedIds(new Set(outcome.events.map((e) => e.tile.id)));

        // Stats.
        const nextStats = applyEventsToStats(loadStats(), outcome.events);
        saveStats(nextStats);
        setStats(nextStats);

        feedback(outcome.events, outcome.newlyFilled.length);

        const timed = flushTime(outcome.state);
        persistGame(timed);

        if (outcome.handCompleted) {
          setMessage("");
        } else if (outcome.events.length > 0) {
          setMessage(describeEvents(outcome.events, outcome.newlyFilled.length));
        } else {
          setMessage("");
        }

        return timed;
      });
    },
    [feedback, flushTime, persistGame],
  );

  // React to status transitions (mahj / game over) after the move commits.
  useEffect(() => {
    if (!game) return;
    if (game.status === "won-hand" && overlay !== "mahj") {
      const empties = game.board.filter((c) => c === null).length;
      // completeHand is pure; compute the bonus preview for the summary.
      playSound("mahj");
      haptics.mahj();
      setHandSummary({ bonus: Math.round(1000 * game.multiplier + empties * 20), empties });
      setOverlay("mahj");
    }
    if (game.status === "game-over" && overlay !== "gameover") {
      playSound("gameover");
      haptics.gameover();
      const finalized = finalizeGame(loadStats(), flushTime(game));
      saveStats(finalized);
      setStats(finalized);
      persistGame({ ...game, status: "game-over" });
      playStart.current = null;
      setOverlay("gameover");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status]);

  const doUndo = useCallback(() => {
    setGame((prev) => {
      if (!prev) return prev;
      const undone = engineUndo(prev);
      if (undone === prev) return prev;
      haptics.tap();
      setGhosts([]);
      setNewTileIds(new Set());
      setCombinedIds(new Set());
      setMessage("Undone");
      persistGame(undone);
      return undone;
    });
  }, [persistGame]);

  const continueAfterHand = useCallback(() => {
    setGame((prev) => {
      if (!prev || prev.status !== "won-hand") return prev;
      const result = completeHand(prev);
      const timed = flushTime(result.state);
      setMessage(`+${result.bonus} • Round ${timed.round}`);
      persistGame(timed);
      return timed;
    });
    setOverlay(null);
    setHandSummary(null);
    setGhosts([]);
    beginTiming();
  }, [beginTiming, flushTime, persistGame]);

  // --- settings -------------------------------------------------------------
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // --- debug ----------------------------------------------------------------
  const replaceGame = useCallback(
    (g: GameState) => {
      setGame(g);
      setOverlay(null);
      setGhosts([]);
      persistGame(g);
      beginTiming();
    },
    [beginTiming, persistGame],
  );

  return {
    ready,
    game,
    settings,
    stats,
    hasSave,
    ghosts,
    newTileIds,
    combinedIds,
    overlay,
    message,
    handSummary,
    // actions
    startNewGame,
    continueGame,
    doMove,
    doUndo,
    continueAfterHand,
    updateSettings,
    beginTiming,
    pauseTiming,
    setStats,
    replaceGame,
    setOverlay,
  };
}

function describeEvents(events: ReturnType<typeof engineMove>["events"], filled: number): string {
  const parts: string[] = [];
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const nice: Record<string, string> = {
    pair: "Pair",
    pung: "Pung",
    run: "Run",
    "dragon-pair": "Dragon pair",
    "dragon-pung": "Dragon pung",
  };
  for (const [k, v] of Object.entries(counts)) parts.push(v > 1 ? `${v} ${nice[k]}s` : nice[k]);
  if (filled > 0) parts.push(filled > 1 ? `${filled} targets!` : "Target!");
  return parts.join(" · ");
}
