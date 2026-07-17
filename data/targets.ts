import type { Suit, TargetPattern, TargetRequirement } from "@/types";
import { newTileId } from "@/game/tiles";

// ---------------------------------------------------------------------------
// Target pattern library
// ---------------------------------------------------------------------------

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
  requirements: Omit<TargetRequirement, "id">[];
};

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    id: "A",
    name: "Opening Draw",
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("number-pung", "NUMBER PUNG"),
      req("suited-run", "SUITED RUN"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
  {
    id: "B",
    name: "Three Suits",
    requirements: [
      req("any-pair", "ANY PAIR"),
      req("suit-set", "DOT SET", "dot"),
      req("suit-set", "BAM SET", "bam"),
      req("suit-set", "CRAK SET", "crak"),
    ],
  },
  {
    id: "C",
    name: "Twin Pungs",
    requirements: [
      req("number-pung", "NUMBER PUNG"),
      req("number-pung", "NUMBER PUNG"),
      req("suited-run", "SUITED RUN"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
  {
    id: "D",
    name: "Full Ladder",
    requirements: [
      req("suit-run", "DOT RUN", "dot"),
      req("suit-run", "BAM RUN", "bam"),
      req("suit-run", "CRAK RUN", "crak"),
      req("any-pair", "ANY PAIR"),
    ],
  },
  {
    id: "E",
    name: "Twin Runs",
    requirements: [
      req("suited-run", "SUITED RUN"),
      req("suited-run", "SUITED RUN"),
      req("number-pung", "NUMBER PUNG"),
      req("dragon-set", "DRAGON SET"),
    ],
  },
];

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
