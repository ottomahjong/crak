import { describe, it, expect } from "vitest";
import {
  runGame,
  summarize,
  boardTypeHash,
  type GameRecord,
} from "./harness";
import { createInitialState, move, completeHand } from "@/game/state/game";
import { PATTERN_TEMPLATES } from "@/data/targets";

const N = Number(process.env.SIM_N ?? 150);

function collect(): GameRecord[] {
  const games: GameRecord[] = [];
  for (let i = 0; i < N; i++) games.push(runGame(1000 + i * 7919));
  return games;
}

describe("simulation report", () => {
  it("runs a batch and prints balance metrics", () => {
    const games = collect();

    const moves = games.map((g) => g.moves);
    const hands = games.map((g) => g.hands);
    const scores = games.map((g) => g.score);
    const rounds = games.map((g) => g.round);

    const totalEvents: Record<string, number> = {};
    for (const g of games)
      for (const [k, v] of Object.entries(g.events)) totalEvents[k] = (totalEvents[k] ?? 0) + v;

    const capped = games.filter((g) => g.ended === "capped").length;
    const zeroHand = games.filter((g) => g.hands === 0).length;
    const cascade = games.reduce((a, g) => a + g.cascadeHands, 0);
    const totalHands = hands.reduce((a, b) => a + b, 0);

    // Per-pattern achievability: of all instances that a game *worked on*,
    // how many were completed, and median moves spent.
    const perPattern: Record<string, { started: number; completed: number; moves: number[] }> = {};
    for (const t of PATTERN_TEMPLATES) perPattern[t.id] = { started: 0, completed: 0, moves: [] };
    for (const g of games)
      for (const pi of g.patternInstances) {
        const p = perPattern[pi.id];
        // Only count instances the game actually engaged (not the final unfinished
        // pattern it died on with 0 moves would still count as started).
        p.started++;
        if (pi.completed) {
          p.completed++;
          p.moves.push(pi.moves);
        }
      }

    // Spawn distribution.
    const spawnCounts: Record<string, number> = {};
    let spawnTotal = 0;
    let maxConsec = 0;
    for (const g of games) {
      maxConsec = Math.max(maxConsec, g.maxConsecutiveSpawn);
      for (const s of g.spawns) {
        spawnCounts[s] = (spawnCounts[s] ?? 0) + 1;
        spawnTotal++;
      }
    }

    console.log(`\n===== CRAK! simulation report (${N} games, heuristic AI) =====`);
    console.log("MOVES/game     ", summarize(moves));
    console.log("HANDS/game     ", summarize(hands));
    console.log("SCORE/game     ", summarize(scores));
    console.log("ROUND reached  ", summarize(rounds));
    console.log(`games capped (never ended): ${capped}/${N}`);
    console.log(`games with 0 hands: ${zeroHand}/${N} (${Math.round((100 * zeroHand) / N)}%)`);
    console.log(
      `cascade hands (<=1 move): ${cascade}/${totalHands} completed hands (${Math.round(
        (100 * cascade) / (totalHands || 1),
      )}%)`,
    );
    console.log("sets created (all games):", totalEvents);
    console.log("\nPER-PATTERN completion (of instances started):");
    for (const [id, p] of Object.entries(perPattern)) {
      const name = PATTERN_TEMPLATES.find((t) => t.id === id)?.name ?? id;
      const rate = p.started ? Math.round((100 * p.completed) / p.started) : 0;
      const med = p.moves.length ? summarize(p.moves).median : "-";
      console.log(
        `  ${id} ${name.padEnd(12)} started=${String(p.started).padStart(4)} completed=${String(
          p.completed,
        ).padStart(4)} (${String(rate).padStart(3)}%) medMoves=${med}`,
      );
    }
    console.log("\nSPAWN distribution (%):");
    const order = Object.keys(spawnCounts).sort();
    for (const k of order) {
      console.log(`  ${k.padEnd(13)} ${((100 * spawnCounts[k]) / spawnTotal).toFixed(1)}%`);
    }
    console.log(`max consecutive identical spawn across all games: ${maxConsec}`);
    console.log("=============================================================\n");

    // Health-bound regression assertions — guard the balance we tuned to.
    const movesMedian = summarize(moves).median;
    const handCompletionRate = (N - zeroHand) / N;
    const openerRate = perPattern["OPEN"].started
      ? perPattern["OPEN"].completed / perPattern["OPEN"].started
      : 0;

    expect(games.length).toBe(N);
    // Games must actually resolve, not run forever.
    expect(capped).toBe(0);
    // A run should be a real session, not 16 moves.
    expect(movesMedian).toBeGreaterThanOrEqual(28);
    // Most players should reach at least one MAHJ.
    expect(handCompletionRate).toBeGreaterThan(0.7);
    // The opening hand is meant to be reliably achievable.
    expect(openerRate).toBeGreaterThan(0.65);
    // Spawns must stay fair — no long identical streaks.
    expect(maxConsec).toBeLessThanOrEqual(4);
    // No degenerate free-hand cascades.
    expect(cascade / (totalHands || 1)).toBeLessThan(0.1);
  }, 120000);

  it("is deterministic: same seed reproduces identical trajectory", () => {
    function trajectory(seed: number): string[] {
      let state = createInitialState(seed);
      const hashes: string[] = [];
      let steps = 0;
      while (steps < 60) {
        hashes.push(`${state.score}#${boardTypeHash(state.board)}`);
        if (state.status === "won-hand") {
          state = completeHand(state).state;
        } else {
          // deterministic fixed policy for this test
          const dirs = ["left", "up", "right", "down"] as const;
          const out = move(state, dirs[steps % 4]);
          state = out.state;
        }
        steps++;
      }
      return hashes;
    }
    const a = trajectory(424242);
    const b = trajectory(424242);
    expect(a).toEqual(b);
  });
});
