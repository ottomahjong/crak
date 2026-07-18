import { describe, it } from "vitest";
import { chooseMove, boardTypeHash } from "./harness";
import { createInitialState, move, completeHand } from "@/game/state/game";
import { hasAnyMove, applyMove } from "@/game/rules/movement";
import type { Direction } from "@/types";

describe("probe", () => {
  it("deep balance metrics", () => {
    const N = 400;
    const handsHist: Record<number, number> = {};
    let diedAfterOpener = 0; // exactly 1 hand then over
    let jokerSpawns = 0;
    let totalSpawns = 0;
    let fullBoardOver = 0; // ended with board actually full & no moves
    let stuckNoDir = 0; // AI had no move but board not full (should be ~0)
    const fillSamples: number[] = []; // mean board occupancy across a game
    let movesTotal = 0;
    let handsTotal = 0;

    for (let i = 0; i < N; i++) {
      let s = createInitialState(9001 + i * 5003);
      let moves = 0;
      let fillSum = 0;
      let fillN = 0;
      while (moves < 20000) {
        if (s.status === "won-hand") {
          s = completeHand(s).state;
          continue;
        }
        if (s.status === "game-over") break;
        const occ = s.board.filter(Boolean).length;
        fillSum += occ;
        fillN++;
        const d = chooseMove(s);
        if (!d) {
          // AI found no changing move.
          if (s.board.every(Boolean) && !hasAnyMove(s.board)) fullBoardOver++;
          else {
            stuckNoDir++;
            if (stuckNoDir <= 2) {
              const occ2 = s.board.filter(Boolean).length;
              const perDir = (["up", "down", "left", "right"] as Direction[]).map(
                (dir) => `${dir}:${applyMove(s.board, dir).changed}`,
              );
              console.log(
                `STUCK sample — occ=${occ2}/16 status=${s.status} hasAnyMove=${hasAnyMove(
                  s.board,
                )} [${perDir.join(" ")}] board=${boardTypeHash(s.board)}`,
              );
            }
          }
          break;
        }
        const o = move(s, d);
        if (!o.changed) break;
        if (o.spawnedTile) {
          totalSpawns++;
          if (o.spawnedTile.isJoker) jokerSpawns++;
        }
        s = o.state;
        moves++;
        if (s.status === "game-over") {
          if (s.board.every(Boolean) && !hasAnyMove(s.board)) fullBoardOver++;
        }
      }
      const h = s.handsCompleted;
      handsHist[h] = (handsHist[h] ?? 0) + 1;
      if (h === 1) diedAfterOpener++;
      movesTotal += moves;
      handsTotal += h;
      fillSamples.push(fillN ? fillSum / fillN : 0);
    }

    const meanFill = fillSamples.reduce((a, b) => a + b, 0) / fillSamples.length;
    console.log("\n----- deep probe (" + N + " games) -----");
    console.log("avgMoves:", (movesTotal / N).toFixed(1), "avgHands:", (handsTotal / N).toFixed(2));
    const hist = Object.entries(handsHist)
      .map(([k, v]) => [Number(k), v] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    console.log(
      "hands histogram:",
      hist.map(([k, v]) => `${k}:${v}(${Math.round((100 * v) / N)}%)`).join("  "),
    );
    console.log("died with exactly 1 hand:", diedAfterOpener, `(${Math.round((100 * diedAfterOpener) / N)}%)`);
    console.log("joker spawn rate:", ((100 * jokerSpawns) / totalSpawns).toFixed(2) + "%");
    console.log("mean board occupancy (of 16):", meanFill.toFixed(1));
    console.log("ended on genuinely full/no-move board:", fullBoardOver, "| stuck (AI no dir, board not full):", stuckNoDir);
    console.log("--------------------------------------\n");
  }, 120000);
});
