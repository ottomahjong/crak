import type { GameState, LearningStage, TileTypeId } from "@/types";
import type { RuleOptions } from "@/game/rules/combine";
import { CONFIG } from "@/game/config";

// ---------------------------------------------------------------------------
// Per-state rule options and tile-pool restrictions.
//
// Kept in its own module (rather than in game/state/game.ts) so the solvability
// analyser can share them without importing the whole engine — the combination
// rules a state runs under are exactly what a fairness check must reason about.
// ---------------------------------------------------------------------------

const DOTS: TileTypeId[] = ["dot-1", "dot-2", "dot-3"];
const BAMS: TileTypeId[] = ["bam-1", "bam-2", "bam-3"];
const DRAGON_TYPES: TileTypeId[] = ["dragon-red", "dragon-green", "dragon-white"];

/** Tile families available per learning hand. undefined = full pool (endless). */
export function learningPool(stage: LearningStage | undefined): Set<TileTypeId> | undefined {
  switch (stage) {
    case 1:
      return new Set(DOTS);
    case 2:
      return new Set([...DOTS, ...BAMS]);
    case 3:
      return new Set([...DOTS, ...BAMS, ...DRAGON_TYPES]);
    case 4:
      return new Set([...DOTS, ...BAMS, ...DRAGON_TYPES, "joker"]);
    default:
      return undefined;
  }
}

/** True once advanced play (Kongs & Quints) is unlocked for this state. */
export function advancedUnlocked(state: Pick<GameState, "round" | "learning">): boolean {
  return !state.learning && state.round >= CONFIG.ADVANCED_ROUND;
}

/** True when the current hand actually asks for a Kong or a Quint. */
export function targetWantsKong(target?: Pick<GameState["target"], "requirements">): boolean {
  return (
    target?.requirements.some(
      (r) => !r.filledBy && (r.kind === "number-kong" || r.kind === "number-quint"),
    ) ?? false
  );
}

/**
 * Rules active for a state:
 *  - hand 1 of learning has runs disabled so partials cannot appear before they
 *    are taught;
 *  - Kongs & Quints are OPTIONAL. A Pung stays a Pung — the pung→kong→quint
 *    extension is enabled only when advanced play is unlocked AND the current
 *    hand actually requires a Kong/Quint, so a player never accidentally spends
 *    a fourth tile upgrading a set the hand doesn't ask for.
 */
export function ruleOptsFor(
  state: Pick<GameState, "learning" | "round"> & { target?: GameState["target"] },
): RuleOptions {
  return {
    runs: state.learning !== 1,
    kongs: advancedUnlocked(state) && targetWantsKong(state.target),
  };
}
