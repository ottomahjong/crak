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
  // --- Tier 1: easy openers (no forced run) --------------------------------
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
    id: "BROOK",
    name: "Little Brook",
    difficulty: 1,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("any-pair", "ANY PAIR"),
      req("any-pair", "ANY PAIR"),
      req("any-set", "ANY SET"),
    ],
  },
  // --- Tier 2: medium (achievable ~45-60%) ---------------------------------
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
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
  {
    id: "FORGE",
    name: "Triple Forge",
    difficulty: 2,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("number-pung", "NUMBER PUNG"),
      req("any-set", "ANY SET"),
    ],
  },
  // --- Tier 3: hard (runs and/or three suits) ------------------------------
  {
    id: "SUITS",
    name: "Three Suits",
    difficulty: 3,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("suit-set", "DOT SET", "dot"),
      req("suit-set", "BAM SET", "bam"),
      req("suit-set", "CRAK SET", "crak"),
    ],
  },
  {
    id: "GATERUN",
    name: "River Gate",
    difficulty: 3,
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
 * Deal the next pattern on a difficulty ramp. The first two rounds are easy so a
 * player reliably banks a couple of hands (and multiplier) before the game asks
 * for pungs, dragon sets or runs — this is what turns a run from "one hand then
 * dead" into a genuine progression.
 *
 *   rounds 1–2   → easy only
 *   rounds 3–4   → easy / medium
 *   rounds 5–6   → easy / medium, with an occasional hard hand
 *   round 7+     → anything
 *
 * Never repeats the immediately-previous pattern when an alternative exists.
 */
export function pickPatternForRound(
  round: number,
  currentId: string,
  rngState: number,
): { pattern: TargetPattern; rngState: number } {
  let maxDiff: number;
  if (round <= 2) maxDiff = 1;
  else if (round <= 6) maxDiff = 2;
  else maxDiff = 3;

  // On rounds 5–6, allow an occasional hard hand to keep late runs tense.
  const r0 = nextRandom(rngState);
  let state = r0.state;
  if (round >= 5 && round <= 6 && r0.value < 0.3) maxDiff = 3;

  let pool = PATTERN_TEMPLATES.filter((t) => t.difficulty <= maxDiff && t.id !== currentId);
  if (pool.length === 0) pool = PATTERN_TEMPLATES.filter((t) => t.id !== currentId);
  if (pool.length === 0) pool = PATTERN_TEMPLATES;

  const r1 = nextRandom(state);
  state = r1.state;
  const pick = pool[Math.floor(r1.value * pool.length)];
  return { pattern: instantiatePattern(pick.id), rngState: state };
}
