"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CombineEvent, Direction, GameState, LearningStage, Settings, Stats, Tile } from "@/types";
import {
  createInitialState,
  move as engineMove,
  undo as engineUndo,
  completeHand,
} from "@/game/state/game";
import { computeHint, type Hint } from "@/game/hints";
import { CONFIG } from "@/game/config";
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
import { handCompletionScore } from "@/game/scoring";
import { playSound, setAudioEnabled, unlockAudio } from "@/lib/audio";
import { haptics, setHapticsEnabled } from "@/lib/haptics";

export type Ghost = { key: string; tile: Tile; index: number; to: number };
export type Overlay = null | "mahj" | "gameover";

export type UseGame = ReturnType<typeof useGame>;

// Three legible phases per swipe (ms). One-cell moves are short and controlled.
const MOVE_MS = CONFIG.MOVE_MS;
const MERGE_MS = CONFIG.MERGE_MS;
const SPAWN_MS = CONFIG.SPAWN_MS;
const HINT_DELAY_MS = CONFIG.HINT_DELAY_MS;

export type EvalMetrics = {
  moves: number;
  firstPairMove: number | null;
  firstPungMove: number | null;
  firstTargetMove: number | null;
  firstMahjMove: number | null;
  invalidSwipes: number;
  setsNotMatched: number;
  helpOpened: number;
  restartedBeforeHand: boolean;
};

function freshEval(): EvalMetrics {
  return {
    moves: 0,
    firstPairMove: null,
    firstPungMove: null,
    firstTargetMove: null,
    firstMahjMove: null,
    invalidSwipes: 0,
    setsNotMatched: 0,
    helpOpened: 0,
    restartedBeforeHand: false,
  };
}

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
  const [hiddenSpawnId, setHiddenSpawnId] = useState<string | null>(null);
  const [spawnEntry, setSpawnEntry] = useState<Direction | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [message, setMessage] = useState<string>("");
  const [handSummary, setHandSummary] = useState<{
    bonus: number;
    empties: number;
    learnedNext: LearningStage | null | undefined;
  } | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [learningIntro, setLearningIntro] = useState<LearningStage | null>(null);
  const [swipeCount, setSwipeCount] = useState(0);

  const gameRef = useRef<GameState | null>(null);
  gameRef.current = game;
  const playStart = useRef<number | null>(null);
  const busy = useRef(false);
  const evalRef = useRef<EvalMetrics>(freshEval());
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const persistGame = useCallback((g: GameState) => {
    saveActiveGame(g);
    setHasSave(g.status !== "game-over");
  }, []);

  const resetTransient = useCallback(() => {
    setGhosts([]);
    setNewTileIds(new Set());
    setCombinedIds(new Set());
    setHiddenSpawnId(null);
    setSpawnEntry(null);
    setHint(null);
  }, []);

  // --- lifecycle ------------------------------------------------------------
  const finalizeAbandoned = useCallback(
    (prev: GameState | null) => {
      if (prev && prev.status !== "game-over" && prev.score > 0) {
        if (prev.handsCompleted === 0) evalRef.current.restartedBeforeHand = true;
        const finalized = finalizeGame(loadStats(), flushTime(prev));
        saveStats(finalized);
        setStats(finalized);
      }
    },
    [flushTime],
  );

  const startNewGame = useCallback(() => {
    finalizeAbandoned(gameRef.current);
    evalRef.current = freshEval();
    const fresh = createInitialState();
    persistGame(fresh);
    setGame(fresh);
    setOverlay(null);
    setLearningIntro(null);
    setMessage("");
    setSwipeCount(0);
    resetTransient();
    beginTiming();
  }, [beginTiming, finalizeAbandoned, persistGame, resetTransient]);

  const startLearningGame = useCallback(() => {
    finalizeAbandoned(gameRef.current);
    evalRef.current = freshEval();
    const fresh = createInitialState(undefined, 1);
    persistGame(fresh);
    setGame(fresh);
    setOverlay(null);
    setMessage("");
    setSwipeCount(0);
    resetTransient();
    setLearningIntro(1);
    beginTiming();
  }, [beginTiming, finalizeAbandoned, persistGame, resetTransient]);

  const continueGame = useCallback(() => {
    const active = loadActiveGame();
    if (active && active.status !== "game-over") {
      setGame(active);
      beginTiming();
    } else {
      startNewGame();
    }
  }, [beginTiming, startNewGame]);

  // --- feedback -------------------------------------------------------------
  const combineSound = useCallback((events: CombineEvent[]) => {
    if (events.some((e) => e.type === "run")) playSound("run");
    else if (events.some((e) => e.type === "dragon-pung" || e.type === "dragon-pair"))
      playSound("dragon");
    else if (events.some((e) => e.type === "pung")) playSound("pung");
    else if (events.some((e) => e.type === "pair")) playSound("pair");
    else if (events.some((e) => e.type === "partial-run")) playSound("partial");
    if (events.length > 0) haptics.combine();
  }, []);

  const triggerGameOver = useCallback(
    (g: GameState) => {
      playSound("gameover");
      haptics.gameover();
      const finalized = finalizeGame(loadStats(), flushTime(g));
      saveStats(finalized);
      setStats(finalized);
      persistGame({ ...g, status: "game-over" });
      playStart.current = null;
      setOverlay("gameover");
    },
    [flushTime, persistGame],
  );

  // --- move (three legible phases) -----------------------------------------
  const doMove = useCallback(
    (dir: Direction) => {
      const prev = gameRef.current;
      if (!prev || prev.status !== "playing" || busy.current) return;
      unlockAudio();
      const reduce = settings.reducedMotion;

      const prevBoard = prev.board;
      const outcome = engineMove(prev, dir);
      if (!outcome.changed) {
        evalRef.current.invalidSwipes += 1;
        return;
      }

      // Clear any idle hint; count the swipe.
      if (hintTimer.current) clearTimeout(hintTimer.current);
      setHint(null);
      setSwipeCount((n) => n + 1);

      // --- metrics ---
      const m = evalRef.current;
      m.moves += 1;
      if (m.firstPairMove == null && outcome.events.some((e) => e.type === "pair"))
        m.firstPairMove = m.moves;
      if (m.firstPungMove == null && outcome.events.some((e) => e.type === "pung"))
        m.firstPungMove = m.moves;
      if (m.firstTargetMove == null && outcome.newlyFilled.length > 0)
        m.firstTargetMove = m.moves;
      if (m.firstMahjMove == null && outcome.handCompleted) m.firstMahjMove = m.moves;
      if (outcome.events.length > 0 && outcome.newlyFilled.length === 0) m.setsNotMatched += 1;

      // --- ghosts (merge sources sliding into the anchor) ---
      const prevById = new Map<string, Tile>();
      const fromIndex = new Map<string, number>();
      prevBoard.forEach((t, i) => {
        if (t) {
          prevById.set(t.id, t);
          fromIndex.set(t.id, i);
        }
      });
      const nextGhosts: Ghost[] = outcome.merges
        .map((mg, k) => {
          const tile = prevById.get(mg.id);
          const from = fromIndex.get(mg.id);
          if (!tile || from == null) return null;
          return { key: `${mg.id}-${k}`, tile, index: from, to: mg.at };
        })
        .filter(Boolean) as Ghost[];

      busy.current = true;
      setGhosts(nextGhosts);
      requestAnimationFrame(() => setGhosts((gs) => gs.map((g) => ({ ...g, index: g.to }))));
      setCombinedIds(new Set(outcome.events.map((e) => e.tile.id)));

      // Phase 3 setup: hide the spawned tile until movement + merge finish.
      const spawnId = outcome.spawnedTile?.id ?? null;
      setNewTileIds(spawnId ? new Set([spawnId]) : new Set());
      setHiddenSpawnId(spawnId);
      setSpawnEntry(outcome.spawnEntry);

      // Commit authoritative state now (logic), phase the visuals via timers.
      const timed = flushTime(outcome.state);
      setGame(timed);
      const nextStats = applyEventsToStats(loadStats(), outcome.events);
      saveStats(nextStats);
      setStats(nextStats);
      persistGame(timed);

      // Message.
      if (!outcome.handCompleted) {
        setMessage(matchMessage(outcome.events, outcome.newlyFilled.length, timed));
      } else {
        setMessage("");
      }

      // --- phase sounds/haptics ---
      playSound("move");
      const mergeAt = reduce ? 0 : MOVE_MS;
      const spawnAt = reduce ? 0 : MOVE_MS + MERGE_MS;
      const doneAt = reduce ? 0 : MOVE_MS + MERGE_MS + SPAWN_MS;

      window.setTimeout(() => {
        combineSound(outcome.events);
        if (outcome.newlyFilled.length > 0) {
          playSound("target");
          haptics.target();
        }
        setGhosts([]);
      }, mergeAt);

      if (spawnId) {
        window.setTimeout(() => {
          setHiddenSpawnId(null); // reveal → entrance animation fires
          playSound("spawn");
          haptics.tap();
        }, spawnAt);
      }

      window.setTimeout(() => {
        busy.current = false;
        if (outcome.handCompleted) {
          const empties = timed.board.filter((c) => c === null).length;
          playSound("mahj");
          haptics.mahj();
          setHandSummary({
            bonus: handCompletionScore(timed.multiplier, empties),
            empties,
            learnedNext: undefined,
          });
          setOverlay("mahj");
        } else if (outcome.gameOver) {
          triggerGameOver(timed);
        }
      }, Math.max(mergeAt, doneAt));
    },
    [combineSound, flushTime, persistGame, settings.reducedMotion, triggerGameOver],
  );

  // --- idle guided hint -----------------------------------------------------
  useEffect(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(null);
    if (!game || game.status !== "playing" || overlay || !settings.guidedPlay) return;
    hintTimer.current = setTimeout(() => {
      const g = gameRef.current;
      if (g && g.status === "playing" && !busy.current) setHint(computeHint(g));
    }, HINT_DELAY_MS);
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.board, overlay, settings.guidedPlay, game?.status]);

  const doUndo = useCallback(() => {
    setGame((prev) => {
      if (!prev) return prev;
      const undone = engineUndo(prev);
      if (undone === prev) return prev;
      haptics.tap();
      resetTransient();
      setMessage("Undone");
      persistGame(undone);
      return undone;
    });
  }, [persistGame, resetTransient]);

  const continueAfterHand = useCallback(() => {
    const prev = gameRef.current;
    if (!prev || prev.status !== "won-hand") return;
    const result = completeHand(prev);
    const timed = flushTime(result.state);
    setGame(timed);
    setHandSummary(null);
    resetTransient();
    // The wall may be spent after banking this hand — the run ends here.
    if (timed.status === "game-over") {
      setMessage("");
      triggerGameOver(timed);
      return;
    }
    persistGame(timed);
    setOverlay(null);
    beginTiming();
    if (result.learningAdvance?.nextStage) {
      setLearningIntro(result.learningAdvance.nextStage);
      setMessage("");
    } else if (result.learningAdvance && result.learningAdvance.nextStage === null) {
      setMessage("Endless mode unlocked — good luck!");
    } else {
      setMessage(`+${result.bonus} • Round ${timed.round}`);
    }
  }, [beginTiming, flushTime, persistGame, resetTransient, triggerGameOver]);

  const dismissLearningIntro = useCallback(() => setLearningIntro(null), []);

  // --- settings -------------------------------------------------------------
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const noteHelpOpened = useCallback(() => {
    evalRef.current.helpOpened += 1;
  }, []);

  const replaceGame = useCallback(
    (g: GameState) => {
      setGame(g);
      setOverlay(null);
      resetTransient();
      persistGame(g);
      beginTiming();
    },
    [beginTiming, persistGame, resetTransient],
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
    hiddenSpawnId,
    spawnEntry,
    overlay,
    message,
    handSummary,
    hint,
    learningIntro,
    swipeCount,
    evalMetrics: evalRef.current,
    // actions
    startNewGame,
    startLearningGame,
    continueGame,
    doMove,
    doUndo,
    continueAfterHand,
    dismissLearningIntro,
    updateSettings,
    noteHelpOpened,
    beginTiming,
    pauseTiming,
    setStats,
    replaceGame,
    setOverlay,
  };
}

/** Explicit, plain-language message for what a move accomplished. */
function matchMessage(events: CombineEvent[], filled: number, state: GameState): string {
  if (events.length === 0) return "";
  const done = state.target.requirements.filter((r) => r.filledBy).length;
  const total = state.target.requirements.length;

  const nice: Record<string, string> = {
    pair: "Pair",
    pung: "Pung",
    run: "Run",
    "partial-run": "Partial run",
    "dragon-pair": "Dragon pair",
    "dragon-pung": "Dragon pung",
  };
  const first = events[0]?.type;
  const label = nice[first ?? ""] ?? "Set";

  if (filled > 0) {
    return `${label} completed — ${done} of ${total} sets`;
  }
  if (first === "partial-run") return "Partial run — add the missing number";
  return `${label} made — useful, but not part of this hand`;
}
