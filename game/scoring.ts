import type { CombineEvent } from "@/types";

// ---------------------------------------------------------------------------
// Scoring constants — all balancing lives here.
// ---------------------------------------------------------------------------

export const SCORING = {
  pair: 20,
  partialRun: 10, // 1·2 or 2·3 started — small nudge, real payoff on completion
  numberPung: 120, // pungs cost two moves + free a cell → reward them
  dragonPair: 45,
  dragonPung: 200,
  run: 140, // runs consume three tiles → the biggest space win
  targetSlot: 120,
  handBase: 600, // hands are frequent now; keep the per-hand payoff meaningful
  emptyCellBonus: 15, // per empty cell at hand completion
  /** Multiplier increment each completed hand (consecutive-hand escalation). */
  multiplierStep: 0.2,
} as const;

export function scoreForEvent(event: CombineEvent): number {
  switch (event.type) {
    case "pair":
      return SCORING.pair;
    case "partial-run":
      return SCORING.partialRun;
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
