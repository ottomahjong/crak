import type {
  LearningStage,
  Suit,
  TargetPattern,
  TargetRequirement,
  TargetRequirementKind,
} from "@/types";
import { newTileId } from "@/game/tiles";
import { nextRandom } from "@/lib/rng";
import { CONFIG } from "@/game/config";

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
  plain?: string,
): Omit<TargetRequirement, "id"> {
  return { kind, label, suit, plain: plain ?? PLAIN_LABEL[kind] };
}

/** Plain-language-first labels, shown before the Mahjong term during learning. */
export const PLAIN_LABEL: Record<TargetRequirementKind, string> = {
  "any-pair": "TWO MATCHING TILES",
  "number-pung": "THREE MATCHING TILES",
  "number-kong": "FOUR MATCHING TILES",
  "number-quint": "FIVE MATCHING TILES",
  "suited-run": "1 + 2 + 3, SAME SUIT",
  "dragon-set": "MATCHING DRAGONS",
  "suit-set": "A SET OF ONE SUIT",
  "suit-run": "1 + 2 + 3 OF THIS SUIT",
  "any-set": "ANY THREE-TILE SET",
};

const SUIT_TITLE: Record<Suit, string> = { dot: "Dot", bam: "Bam", crak: "Crak" };

/** A short, single-token label for a requirement chip (e.g. "Pair", "Bam Run"). */
export function shortRequirementLabel(r: Pick<TargetRequirement, "kind" | "suit">): string {
  const suit = r.suit ? SUIT_TITLE[r.suit] : "";
  switch (r.kind) {
    case "any-pair":
      return "Pair";
    case "number-pung":
      return "Pung";
    case "number-kong":
      return "Kong";
    case "number-quint":
      return "Quint";
    case "suited-run":
      return "Run";
    case "suit-run":
      return `${suit} Run`;
    case "dragon-set":
      return "Dragon";
    case "suit-set":
      return `${suit} Set`;
    case "any-set":
      return "Set";
  }
}

/** A plain-language "what it is" line for the explanation modal. */
export function plainRequirementPhrase(r: Pick<TargetRequirement, "kind" | "suit">): string {
  const suit = r.suit ? SUIT_TITLE[r.suit] : "one suit";
  switch (r.kind) {
    case "any-pair":
      return "Two matching tiles";
    case "number-pung":
      return "Three matching tiles";
    case "number-kong":
      return "Four matching tiles";
    case "number-quint":
      return "Five matching tiles";
    case "suited-run":
      return "1 · 2 · 3 of one suit";
    case "suit-run":
      return `1 · 2 · 3 of ${suit}`;
    case "dragon-set":
      return "A pair or pung of matching dragons";
    case "suit-set":
      return `A pung or run made of ${suit}`;
    case "any-set":
      return "Any pung or run";
  }
}

/** One-sentence explanation for each requirement kind (shown on tap). */
export function explainRequirement(r: Pick<TargetRequirement, "kind" | "suit">): string {
  switch (r.kind) {
    case "any-pair":
      return "Slide two identical tiles together — they fuse into a Pair.";
    case "number-pung":
      return "A Pair plus one more matching tile makes a Pung (three of a kind).";
    case "number-kong":
      return "Extend a Pung with a fourth matching tile to make a Kong.";
    case "number-quint":
      return "Extend a Kong with a fifth matching tile to make a Quint.";
    case "suited-run":
      return "Join 1+2 (or 2+3) of one suit, then add the missing number: a Run.";
    case "dragon-set":
      return "Two matching dragons make a pair; add a third for a pung. Either counts.";
    case "suit-set":
      return `A pung or run made only of ${r.suit ?? "one"} tiles.`;
    case "suit-run":
      return `A 1-2-3 run in ${r.suit ?? "this suit"}.`;
    case "any-set":
      return "Any pung (three of a kind) or run (1-2-3) counts here.";
  }
}

type PatternTemplate = {
  id: string;
  name: string;
  /** 1 easy … 3 hard … 4 advanced (Kongs & Quints). */
  difficulty: 1 | 2 | 3 | 4;
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
  // --- Tier 4: advanced (Kongs & Quints) -----------------------------------
  {
    id: "KONGCALL",
    name: "Kong's Call",
    difficulty: 4,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("number-kong", "NUMBER KONG"),
    ],
  },
  {
    id: "TWINKONGS",
    name: "Twin Kongs",
    difficulty: 4,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("number-kong", "NUMBER KONG"),
      req("number-kong", "NUMBER KONG"),
    ],
  },
  {
    id: "QUINT",
    name: "The Quint",
    difficulty: 4,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("number-quint", "NUMBER QUINT"),
    ],
  },
  {
    id: "DRAGONKONG",
    name: "Dragon Kong",
    difficulty: 4,
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("number-kong", "NUMBER KONG"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
];

export const OPENING_PATTERN_ID = "OPEN";

// ---------------------------------------------------------------------------
// Learning-game hands (one new concept per hand; not used in endless rotation)
// ---------------------------------------------------------------------------

const LEARNING_TEMPLATES: Record<LearningStage, { name: string; requirements: Omit<TargetRequirement, "id">[] }> = {
  1: {
    name: "Your First Hand",
    requirements: [
      req("any-pair", "Pair", undefined, "TWO MATCHING TILES"),
      req("number-pung", "Pung", undefined, "THREE MATCHING TILES"),
    ],
  },
  2: {
    name: "Learn the Run",
    requirements: [
      req("any-pair", "Pair", undefined, "TWO MATCHING TILES"),
      req("number-pung", "Pung", undefined, "THREE MATCHING TILES"),
      req("suited-run", "Run", undefined, "1 + 2 + 3, SAME SUIT"),
    ],
  },
  3: {
    name: "Meet the Dragons",
    requirements: [
      req("any-pair", "Pair", undefined, "TWO MATCHING TILES"),
      req("any-set", "Any Set", undefined, "ANY PUNG OR RUN"),
      req("dragon-set", "Dragon Set", undefined, "MATCHING DRAGONS"),
    ],
  },
  4: {
    name: "The Joker",
    requirements: [
      req("any-pair", "Pair", undefined, "TWO MATCHING TILES"),
      req("number-pung", "Pung", undefined, "THREE MATCHING TILES"),
      req("suited-run", "Run", undefined, "1 + 2 + 3, SAME SUIT"),
      req("dragon-set", "Dragon Set", undefined, "MATCHING DRAGONS"),
    ],
  },
};

export function instantiateLearningPattern(stage: LearningStage): TargetPattern {
  const t = LEARNING_TEMPLATES[stage];
  return {
    id: `LEARN${stage}`,
    name: t.name,
    requirements: t.requirements.map((r) => ({ ...r, id: newTileId("req") })),
  };
}

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
 *   rounds 1–2         → easy only
 *   rounds 3–4         → easy / medium
 *   rounds 5–6         → easy / medium, with an occasional hard hand
 *   rounds 7 … ADV-1   → up to hard (runs, three suits)
 *   ADVANCED_ROUND+    → anything, including Kong/Quint hands
 *
 * Advanced (Kong/Quint) hands are only dealt once kongs are enabled at
 * ADVANCED_ROUND, so a kong-requiring hand is never impossible to build.
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
  else if (round < CONFIG.ADVANCED_ROUND) maxDiff = 3;
  else maxDiff = 4;

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
