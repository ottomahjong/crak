import type { Board, GameState, Tile } from "@/types";
import {
  isJoker,
  isLooseDragon,
  isLooseNumber,
  isPair,
  isPartialRun,
  missingRank,
  tileLabel,
} from "@/game/tiles";

// ---------------------------------------------------------------------------
// Guided Play: relationship hints + one-line next-move suggestions.
//
// Pure and deterministic so it can be tested. Hints only ever point at
// combinations that are legal under the collision table in combine.ts — the
// tests assert this. The goal is to reveal RELATIONSHIPS between tiles, not to
// solve the board.
// ---------------------------------------------------------------------------

export type Hint = {
  /** Tile ids that belong together (outlined on the board). */
  ids: string[];
  /** One short suggestion line. */
  text: string;
};

function tiles(board: Board): Tile[] {
  return board.filter((t): t is Tile => !!t);
}

export function computeHint(state: Pick<GameState, "board" | "target" | "learning">): Hint {
  const all = tiles(state.board);
  const unfilled = state.target.requirements.filter((r) => !r.filledBy);
  const runsEnabled = state.learning !== 1;

  // 1. A pair one tile away from a pung (or a joker to finish it).
  for (const pair of all) {
    if (!isPair(pair)) continue;
    const match = all.find(
      (t) =>
        (isLooseNumber(t) && t.suit === pair.suit && t.rank === pair.rank) ||
        (isLooseDragon(t) && !!pair.dragon && t.dragon === pair.dragon),
    );
    if (match) {
      return { ids: [pair.id, match.id], text: `Add another ${tileLabel(match)} to your pair.` };
    }
    const joker = all.find(isJoker);
    if (joker) {
      return { ids: [pair.id, joker.id], text: "A Joker can finish this pair into a pung." };
    }
  }

  // 2. A partial run one tile away from a run.
  if (runsEnabled) {
    for (const part of all) {
      if (!isPartialRun(part) || !part.suit) continue;
      const need = missingRank(part);
      const fill = all.find(
        (t) => isLooseNumber(t) && t.suit === part.suit && t.rank === need,
      );
      if (fill) {
        return {
          ids: [part.id, fill.id],
          text: `Add the ${need} ${cap(part.suit)} to finish the run.`,
        };
      }
      const joker = all.find(isJoker);
      if (joker) {
        return { ids: [part.id, joker.id], text: "A Joker can finish this run." };
      }
    }
  }

  // 3. Two identical loose tiles → pair.
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (!isLooseNumber(a) && !isLooseDragon(a)) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      const same =
        (isLooseNumber(a) && isLooseNumber(b) && a.suit === b.suit && a.rank === b.rank) ||
        (isLooseDragon(a) && isLooseDragon(b) && a.dragon === b.dragon);
      if (same) {
        return { ids: [a.id, b.id], text: `Match the two ${tileLabel(a)}s.` };
      }
    }
  }

  // 4. Adjacent ranks of one suit → start a run (1+2 or 2+3).
  if (runsEnabled) {
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (!isLooseNumber(a)) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (!isLooseNumber(b) || b.suit !== a.suit) continue;
        if (Math.abs((a.rank ?? 0) - (b.rank ?? 0)) === 1) {
          return {
            ids: [a.id, b.id],
            text: `Bring the ${a.rank} and ${b.rank} ${cap(a.suit!)}s together.`,
          };
        }
      }
    }
  }

  // 5. Goal-level nudges from the remaining targets.
  if (unfilled.length === 1) {
    return { ids: [], text: "One more set for Mahj." };
  }
  if (unfilled.some((r) => r.kind === "dragon-set")) {
    const dragon = all.find(isLooseDragon);
    if (dragon) {
      return { ids: [dragon.id], text: "You need a dragon set — collect matching dragons." };
    }
  }

  return { ids: [], text: "Keep similar tiles near each other." };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
