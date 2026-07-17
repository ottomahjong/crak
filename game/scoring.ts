import type { CombineEvent } from "@/types";

// ---------------------------------------------------------------------------
// Scoring constants — all balancing lives here.
// ---------------------------------------------------------------------------

export const SCORING = {
  pair: 25,
  numberPung: 100,
  dragonPair: 50,
  dragonPung: 175,
  run: 125,
  targetSlot: 100,
  handBase: 1000,
  emptyCellBonus: 20, // per empty cell at hand completion
  /** Multiplier increment each completed hand. */
  multiplierStep: 0.25,
  /** Consecutive-hand escalation is folded into the multiplier growth. */
} as const;

export function scoreForEvent(event: CombineEvent): number {
  switch (event.type) {
    case "pair":
      return SCORING.pair;
    case "pung":
      return SCORING.numberPung;
    case "dragon-pair":
      return SCORING.dragonPair;
    case "dragon-pung":
      return SCORING.dragonPung;
    case "run":
      return SCORING.run;
    default:
      return 0;
  }
}

export function scoreForEvents(events: CombineEvent[]): number {
  return events.reduce((sum, e) => sum + scoreForEvent(e), 0);
}

export function handCompletionScore(multiplier: number, emptyCells: number): number {
  return Math.round(
    SCORING.handBase * multiplier + emptyCells * SCORING.emptyCellBonus,
  );
}
