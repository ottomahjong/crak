import type { Suit, TargetPattern, TargetRequirement } from "@/types";
import { newTileId } from "@/game/tiles";
import { nextRandom } from "@/lib/rng";

// ---------------------------------------------------------------------------
// Target pattern library
// ---------------------------------------------------------------------------
//
// Patterns are tiered by difficulty (1 = easy … 3 = hard) and dealt on a ramp:
// early rounds only draw easy hands, so a player reliably completes an opening
// hand (building score + multiplier) before the game asks for a dragon set or a
// board full of runs. See pickPatternForRound.

function req(
  kind: TargetRequirement["kind"],
  label: string,
  suit?: Suit,
): Omit<TargetRequirement, "id"> {
  return { kind, label, suit };
}

type PatternTemplate = {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3;
  requirements: Omit<TargetRequirement, "id">[];
};

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    id: "OPEN",
    name: "Opening Draw",
    difficulty: 1,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("any-pair", "ANY PAIR"),
      req("any-set", "ANY SET"),
      req("any-set", "ANY SET"),
    ],
  },
  {
    id: "SUITS",
    name: "Three Suits",
    difficulty: 2,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("suit-set", "DOT SET", "dot"),
      req("suit-set", "BAM SET", "bam"),
      req("suit-set", "CRAK SET", "crak"),
    ],
  },
  {
    id: "TWINS",
    name: "Twin Pungs",
    difficulty: 2,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("number-pung", "NUMBER PUNG"),
    ],
  },
  {
    id: "GATE",
    name: "Dragon's Gate",
    difficulty: 2,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("suited-run", "SUITED RUN"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
  {
    id: "LADDER",
    name: "Full Ladder",
    difficulty: 3,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("suit-run", "DOT RUN", "dot"),
      req("suit-run", "BAM RUN", "bam"),
      req("suit-run", "CRAK RUN", "crak"),
    ],
  },
  {
    id: "TWINRUNS",
    name: "Twin Runs",
    difficulty: 3,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("suited-run", "SUITED RUN"),
      req("suited-run", "SUITED RUN"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
];

export const OPENING_PATTERN_ID = "OPEN";

export function patternDifficulty(id: string): number {
  return PATTERN_TEMPLATES.find((t) => t.id === id)?.difficulty ?? 2;
}

/** Build a fresh (unfilled) TargetPattern from a template. */
export function instantiatePattern(templateId: string): TargetPattern {
  const template =
    PATTERN_TEMPLATES.find((t) => t.id === templateId) ?? PATTERN_TEMPLATES[0];
  return {
    id: template.id,
    name: template.name,
    requirements: template.requirements.map((r) => ({ ...r, id: newTileId("req") })),
  };
}

/**
 * Deal the next pattern with a difficulty ramp:
 *   round 1        → easy only
 *   rounds 2–3     → easy / medium
 *   rounds 4–5     → medium (with occasional hard)
 *   round 6+       → anything
 * Never repeats the immediately-previous pattern when an alternative exists.
 */
export function pickPatternForRound(
  round: number,
  currentId: string,
  rngState: number,
): { pattern: TargetPattern; rngState: number } {
  let maxDiff: number;
  if (round <= 1) maxDiff = 1;
  else if (round <= 3) maxDiff = 2;
  else if (round <= 5) maxDiff = 2;
  else maxDiff = 3;

  // On rounds 4–5, allow an occasional hard hand.
  const r0 = nextRandom(rngState);
  let state = r0.state;
  if (round >= 4 && round <= 5 && r0.value < 0.34) maxDiff = 3;

  let pool = PATTERN_TEMPLATES.filter((t) => t.difficulty <= maxDiff && t.id !== currentId);
  if (pool.length === 0) pool = PATTERN_TEMPLATES.filter((t) => t.id !== currentId);
  if (pool.length === 0) pool = PATTERN_TEMPLATES;

  const r1 = nextRandom(state);
  state = r1.state;
  const pick = pool[Math.floor(r1.value * pool.length)];
  return { pattern: instantiatePattern(pick.id), rngState: state };
}
