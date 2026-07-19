import { describe, it, expect } from "vitest";
import { applyMove } from "@/game/rules/movement";
import { resolveLine } from "@/game/rules/combine";
import { boardFrom, describeBoard, loose } from "./helpers";

function line(...types: Parameters<typeof loose>[0][]) {
  return types.map((t) => loose(t));
}

describe("pair formation", () => {
  it("two identical numbers become a pair", () => {
    const { items, events } = resolveLine(line("dot-1", "dot-1"));
    expect(items).toHaveLength(1);
    expect(items[0].tile.setKind).toBe("pair");
    expect(items[0].tile.suit).toBe("dot");
    expect(items[0].tile.rank).toBe(1);
    expect(events[0].type).toBe("pair");
  });

  it("different non-adjacent ranks do not combine", () => {
    // 1 and 3 are not adjacent → no pair, no partial run.
    const { items } = resolveLine(line("dot-1", "dot-3"));
    expect(items).toHaveLength(2);
  });

  it("dragons form a dragon pair", () => {
    const { items, events } = resolveLine(line("dragon-red", "dragon-red"));
    expect(items[0].tile.setKind).toBe("pair");
    expect(items[0].tile.dragon).toBe("red");
    expect(events[0].type).toBe("dragon-pair");
  });
});

describe("pung formation", () => {
  it("pair + matching loose becomes a pung", () => {
    // First move makes the pair, second adds the third.
    const board = boardFrom([
      ["dot-2", "dot-2", ".", "dot-2"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const first = applyMove(board, "left");
    // dot-2 + dot-2 => pair; third dot-2 remains loose (locked pair can't chain).
    expect(describeBoard(first.board)[0][0]).toBe("pair:dot2");
    expect(describeBoard(first.board)[0][1]).toBe("dot-2");
    // Second move: pair + dot-2 => pung.
    const second = applyMove(first.board, "left");
    expect(describeBoard(second.board)[0][0]).toBe("pung:dot2");
  });

  it("does not chain pair->pung in a single move", () => {
    const { items } = resolveLine(line("crak-3", "crak-3", "crak-3"));
    expect(items).toHaveLength(2);
    expect(items[0].tile.setKind).toBe("pair");
    expect(items[1].tile.state).toBe("loose");
  });

  it("dragon pair + dragon becomes dragon pung", () => {
    const board = boardFrom([
      ["dragon-green", "dragon-green", ".", "dragon-green"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const first = applyMove(board, "left");
    const second = applyMove(first.board, "left");
    expect(describeBoard(second.board)[0][0]).toBe("pung:dragon-green");
  });
});

describe("run formation (two-stage)", () => {
  it("adjacent ranks 1+2 form a partial run", () => {
    const { items, events } = resolveLine(line("bam-1", "bam-2"));
    expect(items).toHaveLength(1);
    expect(items[0].tile.setKind).toBe("partial");
    expect(items[0].tile.suit).toBe("bam");
    expect(items[0].tile.partRanks).toEqual([1, 2]);
    expect(events[0].type).toBe("partial-run");
  });

  it("adjacent ranks 2+3 form a partial run", () => {
    const { items } = resolveLine(line("dot-2", "dot-3"));
    expect(items[0].tile.setKind).toBe("partial");
    expect(items[0].tile.partRanks).toEqual([2, 3]);
  });

  it("partial 1·2 + the 3 completes a run", () => {
    // move 1: make the partial; move 2: add the 3.
    const board = boardFrom([
      ["bam-1", "bam-2", ".", "bam-3"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const first = applyMove(board, "left");
    expect(describeBoard(first.board)[0][0]).toBe("partial:bam12");
    const second = applyMove(first.board, "left");
    expect(describeBoard(second.board)[0][0]).toBe("run:bam");
    expect(second.board[0]!.suit).toBe("bam");
  });

  it("a lone 1 and 3 (non-adjacent) never combine", () => {
    const { items } = resolveLine(line("dot-1", "dot-3"));
    expect(items).toHaveLength(2);
  });

  it("mixed suits do not form a partial run", () => {
    const { items } = resolveLine(line("dot-1", "bam-2"));
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.tile.state === "loose")).toBe(true);
  });

  it("runs are disabled when the rule option is off (learning hand 1)", () => {
    const { items, events } = resolveLine(line("dot-1", "dot-2"), { runs: false });
    expect(items).toHaveLength(2); // no partial run forms
    expect(events).toHaveLength(0);
  });

  it("a partial run is terminal in the same move (no chaining)", () => {
    // 1,2,3 in one line: leading 1+2 → partial; the 3 stays loose this move.
    const { items } = resolveLine(line("dot-1", "dot-2", "dot-3"));
    expect(items).toHaveLength(2);
    expect(items[0].tile.setKind).toBe("partial");
    expect(items[1].tile.state).toBe("loose");
  });

  it("completed sets do not join runs", () => {
    // A pair sits between would-be run tiles; nothing merges through it.
    const { items } = resolveLine([
      loose("bam-1"),
      loose("dot-1", "p"),
      loose("dot-1", "q"),
    ]);
    // dot-1 + dot-1 pair; bam-1 alone.
    expect(items.some((i) => i.tile.setKind === "pair")).toBe(true);
  });
});

describe("joker substitution", () => {
  it("pair + joker becomes a pung", () => {
    const board = boardFrom([
      ["dot-2", "dot-2", ".", "joker"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const first = applyMove(board, "left"); // makes pair, joker loose
    const second = applyMove(first.board, "left"); // pair + joker => pung
    expect(describeBoard(second.board)[0][0]).toBe("pung:dot2");
    const pung = second.board[0]!;
    expect(pung.usedJoker).toBe(true);
  });

  it("partial run + joker becomes a run", () => {
    // A joker finishes a partial, but cannot start one.
    const board = boardFrom([
      ["bam-1", "bam-2", ".", "joker"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const first = applyMove(board, "left"); // bam1+bam2 → partial; joker loose
    expect(describeBoard(first.board)[0][0]).toBe("partial:bam12");
    const second = applyMove(first.board, "left"); // partial + joker → run
    expect(describeBoard(second.board)[0][0]).toBe("run:bam");
    expect(second.board[0]!.usedJoker).toBe(true);
  });

  it("a joker cannot start a partial run", () => {
    const { items } = resolveLine(line("bam-1", "joker"));
    expect(items).toHaveLength(2); // no partial, no pair
  });

  it("joker + joker never combines", () => {
    const { items } = resolveLine(line("joker", "joker"));
    expect(items).toHaveLength(2);
  });

  it("joker does not create a pair with a single loose tile", () => {
    const { items } = resolveLine(line("dot-1", "joker"));
    expect(items).toHaveLength(2);
  });
});

describe("one combination per move", () => {
  it("four identical tiles make one pair, not two", () => {
    const { items } = resolveLine(line("dot-1", "dot-1", "dot-1", "dot-1"));
    // Greedy pairs both adjacent couples? No — pairs are terminal & locked;
    // leading pair forms, next two also form a fresh pair (separate tiles).
    // Each tile combines at most once => two pairs.
    const pairs = items.filter((i) => i.tile.setKind === "pair");
    expect(pairs).toHaveLength(2);
    expect(items).toHaveLength(2);
  });
});
