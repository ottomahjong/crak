"use client";

import { forwardRef } from "react";
import type { Board as BoardModel, Direction } from "@/types";
import { CELL_COUNT } from "@/types";
import { cellStyle } from "@/lib/layout";
import { Tile } from "./Tile";
import type { Ghost } from "@/hooks/useGame";

type Props = {
  board: BoardModel;
  ghosts: Ghost[];
  newTileIds: Set<string>;
  combinedIds: Set<string>;
  hiddenSpawnId?: string | null;
  spawnEntry?: Direction | null;
  hintIds?: Set<string>;
  showLearningLabels?: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
};

export const Board = forwardRef<HTMLDivElement, Props>(function Board(
  {
    board,
    ghosts,
    newTileIds,
    combinedIds,
    hiddenSpawnId,
    spawnEntry,
    hintIds,
    showLearningLabels,
    highContrast,
    reducedMotion,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className="crak-board"
      role="grid"
      aria-label="Game board, 4 by 4"
      style={{ touchAction: "none" }}
    >
      {/* Empty cell backgrounds */}
      {Array.from({ length: CELL_COUNT }).map((_, i) => {
        const pos = cellStyle(i);
        return (
          <div
            key={`cell-${i}`}
            className="crak-cell"
            style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
          />
        );
      })}

      {/* Ghost tiles sliding into merges */}
      {ghosts.map((g) => (
        <Tile
          key={`ghost-${g.key}`}
          tile={g.tile}
          index={g.index}
          highContrast={highContrast}
          reducedMotion={reducedMotion}
          ghost
        />
      ))}

      {/* Live tiles. The just-spawned tile stays hidden until movement + merge
          finish, so the three phases never overlap. */}
      {board.map((tile, i) =>
        tile && tile.id !== hiddenSpawnId ? (
          <Tile
            key={tile.id}
            tile={tile}
            index={i}
            isNew={newTileIds.has(tile.id)}
            isCombined={combinedIds.has(tile.id)}
            hinted={hintIds?.has(tile.id)}
            entryEdge={newTileIds.has(tile.id) ? spawnEntry : null}
            showLearningLabel={showLearningLabels}
            highContrast={highContrast}
            reducedMotion={reducedMotion}
          />
        ) : null,
      )}
    </div>
  );
});
