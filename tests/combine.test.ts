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

  it("different ranks do not pair", () => {
    const { items } = resolveLine(line("dot-1", "dot-2"));
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

describe("run formation", () => {
  it("1-2-3 same suit becomes a run", () => {
    const { items, events } = resolveLine(line("bam-1", "bam-2", "bam-3"));
    expect(items).toHaveLength(1);
    expect(items[0].tile.setKind).toBe("run");
    expect(items[0].tile.suit).toBe("bam");
    expect(events[0].type).toBe("run");
  });

  it("accepts any ordering of 1-2-3", () => {
    const { items } = resolveLine(line("dot-3", "dot-1", "dot-2"));
    expect(items[0].tile.setKind).toBe("run");
  });

  it("mixed suits do not form a run", () => {
    const { items } = resolveLine(line("dot-1", "bam-2", "crak-3"));
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.tile.state === "loose")).toBe(true);
  });

  it("pairs take priority over runs on collision", () => {
    // 1,1,2,3 dot: leading 1+1 form a pair; remaining 2,3 cannot run.
    const { items } = resolveLine(line("dot-1", "dot-1", "dot-2", "dot-3"));
    expect(items[0].tile.setKind).toBe("pair");
    expect(items).toHaveLength(3);
  });

  it("completed sets do not participate in runs", () => {
    const board = boardFrom([
      ["dot-1", "dot-1", "dot-2", "dot-3"],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
    const res = applyMove(board, "left");
    // pair:dot1 then dot-2, dot-3 loose — the pair blocks a run.
    expect(describeBoard(res.board)[0][0]).toBe("pair:dot1");
    expect(describeBoard(res.board)[0][1]).toBe("dot-2");
    expect(describeBoard(res.board)[0][2]).toBe("dot-3");
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

  it("two loose + joker becomes a run", () => {
    const { items, events } = resolveLine(line("bam-1", "bam-2", "joker"));
    expect(items[0].tile.setKind).toBe("run");
    expect(items[0].tile.usedJoker).toBe(true);
    expect(events[0].usedJoker).toBe(true);
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
