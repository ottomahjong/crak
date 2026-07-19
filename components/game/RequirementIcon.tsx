"use client";

import type { TargetRequirement } from "@/types";
import { SuitGlyph, DragonGlyph } from "@/components/tiles/glyphs";

// A tiny illustration of what a slot wants: repeated marks for pairs/pungs, a
// 1-2-3 sequence for runs, a dragon mark for dragon sets.
export function RequirementIcon({ req }: { req: TargetRequirement }) {
  const suit = req.suit ?? "dot";

  switch (req.kind) {
    case "any-pair":
      return (
        <span className="req-icon">
          <SuitGlyph suit={suit} size={12} />
          <SuitGlyph suit={suit} size={12} />
        </span>
      );
    case "number-pung":
    case "suit-set":
    case "any-set":
      return (
        <span className="req-icon">
          <SuitGlyph suit={suit} size={11} />
          <SuitGlyph suit={suit} size={11} />
          <SuitGlyph suit={suit} size={11} />
        </span>
      );
    case "suited-run":
    case "suit-run":
      return (
        <span className="req-icon req-icon--run" style={{ color: `var(--suit-${suit})` }}>
          <b>1</b>
          <b>2</b>
          <b>3</b>
        </span>
      );
    case "dragon-set":
      return (
        <span className="req-icon">
          <DragonGlyph dragon="red" size={13} />
          <DragonGlyph dragon="red" size={13} />
        </span>
      );
    default:
      return null;
  }
}
