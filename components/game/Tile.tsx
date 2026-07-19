"use client";

import type { Direction, Tile as TileModel } from "@/types";
import { cellStyle } from "@/lib/layout";
import { TileFace } from "@/components/tiles/TileFace";

type Props = {
  tile: TileModel;
  index: number;
  isNew?: boolean;
  isCombined?: boolean;
  hinted?: boolean;
  showLearningLabel?: boolean;
  entryEdge?: Direction | null;
  highContrast: boolean;
  reducedMotion: boolean;
  ghost?: boolean;
};

// How far off its cell a newly-spawned tile starts, so it visibly slides in
// from the entry edge. Expressed as a translate on the animating wrapper.
function entryTransform(edge: Direction | null | undefined): string | undefined {
  switch (edge) {
    case "left":
      return "translateX(-120%)";
    case "right":
      return "translateX(120%)";
    case "up":
      return "translateY(-120%)";
    case "down":
      return "translateY(120%)";
    default:
      return undefined;
  }
}

export function Tile({
  tile,
  index,
  isNew,
  isCombined,
  hinted,
  showLearningLabel,
  entryEdge,
  highContrast,
  reducedMotion,
  ghost,
}: Props) {
  const pos = cellStyle(index);
  const classes = [
    "crak-tile",
    tile.state === "completed" ? "crak-tile--set" : "crak-tile--loose",
    tile.setKind === "partial" ? "crak-tile--partial" : "",
    tile.usedForTarget ? "crak-tile--used" : "",
    !reducedMotion && isNew ? "crak-tile--spawn" : "",
    !reducedMotion && isCombined ? "crak-tile--pop" : "",
    hinted ? "crak-tile--hint" : "",
    ghost ? "crak-tile--ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // New tiles slide in from the entry edge (unless reduced motion).
  const innerStyle =
    isNew && !reducedMotion && entryEdge
      ? { animationName: "tile-enter", ["--enter-from" as string]: entryTransform(entryEdge) }
      : undefined;

  return (
    <div
      className={classes}
      style={{
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        transition: reducedMotion ? "none" : undefined,
      }}
      data-suit={tile.suit ?? (tile.dragon ? "dragon" : tile.isJoker ? "joker" : "")}
      aria-hidden={ghost ? true : undefined}
    >
      <div className="crak-tile__inner" style={innerStyle}>
        <TileFace tile={tile} highContrast={highContrast} learningLabel={showLearningLabel} />
      </div>
    </div>
  );
}
