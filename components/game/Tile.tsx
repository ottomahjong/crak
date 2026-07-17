"use client";

import type { Tile as TileModel } from "@/types";
import { cellStyle } from "@/lib/layout";
import { TileFace } from "@/components/tiles/TileFace";

type Props = {
  tile: TileModel;
  index: number;
  isNew?: boolean;
  isCombined?: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  ghost?: boolean;
};

export function Tile({ tile, index, isNew, isCombined, highContrast, reducedMotion, ghost }: Props) {
  const pos = cellStyle(index);
  const classes = [
    "crak-tile",
    tile.state === "completed" ? "crak-tile--set" : "crak-tile--loose",
    tile.usedForTarget ? "crak-tile--used" : "",
    !reducedMotion && isNew ? "crak-tile--spawn" : "",
    !reducedMotion && isCombined ? "crak-tile--pop" : "",
    ghost ? "crak-tile--ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
      <div className="crak-tile__inner">
        <TileFace tile={tile} highContrast={highContrast} />
      </div>
    </div>
  );
}
