import { describe, it, expect } from "vitest";
import { ruleOptsFor } from "@/game/rules/options";
import { applyMove } from "@/game/rules/movement";
import { reconcileTargets } from "@/game/rules/targets";
import { createInitialState, completeHand } from "@/game/state/game";
import { instantiatePattern } from "@/data/targets";
import { makePung, makePair } from "@/game/tiles";
import { emptyBoard, loose } from "./helpers";
import type { GameState } from "@/types";

const base = (patch: Partial<GameState>): GameState => ({ ...createInitialState(1), ...patch });

describe("Kongs & Quints are optional (target-gated)", () => {
  it("kongs only combine when the hand actually asks for a Kong/Quint", () => {
    const open = instantiatePattern("OPEN"); // no kong requirement
    const kongCall = instantiatePattern("KONGCALL"); // has a number-kong

    // Advanced round, but the hand doesn't want a kong → pungs stay terminal.
    expect(ruleOptsFor(base({ round: 8, learning: undefined, target: open })).kongs).toBe(false);
    // Advanced round and the hand wants a kong → extension enabled.
    expect(ruleOptsFor(base({ round: 8, learning: undefined, target: kongCall })).kongs).toBe(true);
    // Before advanced play, never — even for a kong hand.
    expect(ruleOptsFor(base({ round: 3, learning: undefined, target: kongCall })).kongs).toBe(false);
  });

  it("a Pung stays a Pung when the hand doesn't need a Kong", () => {
    const board = emptyBoard();
    board[3] = makePung({ suit: "dot", rank: 1 }, false, "pung"); // right edge
    board[2] = loose("dot-1", "extra"); // a fourth matching tile beside it
    const s = base({ round: 8, learning: undefined, target: instantiatePattern("OPEN"), board });
    const res = applyMove(board, "right", ruleOptsFor(s));
    // No kong event; the pung is untouched and the fourth tile is simply blocked.
    expect(res.events).toHaveLength(0);
    const pung = res.board.find((t) => t?.id === "pung");
    expect(pung?.setKind).toBe("pung");
  });

  it("the same collision makes a Kong when the hand requires one", () => {
    const board = emptyBoard();
    board[3] = makePung({ suit: "dot", rank: 1 }, false, "pung");
    board[2] = loose("dot-1", "extra");
    const s = base({ round: 8, learning: undefined, target: instantiatePattern("KONGCALL"), board });
    const res = applyMove(board, "right", ruleOptsFor(s));
    expect(res.events.some((e) => e.type === "kong")).toBe(true);
    expect(res.board.find((t) => t?.id === "pung")?.setKind).toBe("kong");
  });
});

describe("the rack banks completed hands", () => {
  it("completeHand records the banked sets and clears them from the board", () => {
    const target = instantiatePattern("OPEN"); // 2 pairs + 2 sets
    const board = emptyBoard();
    board[0] = makePair({ suit: "dot", rank: 2 }, false, "p1");
    board[1] = makePair({ suit: "bam", rank: 1 }, false, "p2");
    board[2] = makePung({ suit: "crak", rank: 1 }, false, "s1");
    board[3] = makePung({ suit: "dot", rank: 3 }, false, "s2");
    const rec = reconcileTargets(target, board);
    expect(rec.complete).toBe(true);

    const s = base({ target: rec.target, board: rec.board });
    const result = completeHand(s);
    expect(result.state.rack).toHaveLength(1);
    expect(result.state.rack[0].tiles).toHaveLength(4);
    // The banked sets left the board (spent, out of circulation).
    const stillThere = result.state.board.filter((t) => t && ["p1", "p2", "s1", "s2"].includes(t.id));
    expect(stillThere).toHaveLength(0);
  });
});
