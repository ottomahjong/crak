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

/**
 * Rules active for a state:
 *  - hand 1 of learning has runs disabled so partials cannot appear before they
 *    are taught;
 *  - Kongs & Quints unlock in endless mode at CONFIG.ADVANCED_ROUND.
 */
export function ruleOptsFor(state: Pick<GameState, "learning" | "round">): RuleOptions {
  return { runs: state.learning !== 1, kongs: advancedUnlocked(state) };
}
