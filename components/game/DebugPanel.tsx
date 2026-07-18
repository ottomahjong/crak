"use client";

import { useState } from "react";
import type { Board, GameState, TileTypeId } from "@/types";
import { CELL_COUNT } from "@/types";
import { createInitialState, setTarget } from "@/game/state/game";
import { reconcileTargets } from "@/game/rules/targets";
import { instantiatePattern, PATTERN_TEMPLATES } from "@/data/targets";
import {
  makeLooseFromType,
  makePair,
  makePung,
  makeRun,
  ALL_TILE_TYPES,
} from "@/game/tiles";

type Props = {
  game: GameState;
  onApply: (g: GameState) => void;
};

function emptyBoard(): Board {
  return new Array(CELL_COUNT).fill(null);
}

export function DebugPanel({ game, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [spawn, setSpawn] = useState<TileTypeId>("dot-1");

  const withBoard = (board: Board, patternId = game.target.id): GameState => {
    const pattern = instantiatePattern(patternId);
    const rec = reconcileTargets(pattern, board);
    return { ...game, board: rec.board, target: rec.target, status: "playing" };
  };

  const nearlyComplete = () => {
    const b = emptyBoard();
    // Three of four GATERUN slots filled; leave the dragon set to the player.
    b[0] = makePair({ suit: "dot", rank: 1 });
    b[1] = makePung({ suit: "bam", rank: 2 });
    b[2] = makeRun("crak");
    b[4] = makeLooseFromType("dragon-red");
    b[5] = makeLooseFromType("dragon-red");
    b[6] = makeLooseFromType("dragon-red");
    onApply(withBoard(b, "GATERUN"));
  };

  const fullHand = () => {
    const b = emptyBoard();
    b[0] = makePair({ suit: "dot", rank: 1 });
    b[1] = makePung({ suit: "bam", rank: 2 });
    b[2] = makeRun("crak");
    b[3] = makePung({ dragon: "red" });
    const g = withBoard(b, "GATERUN");
    onApply({ ...g, status: reconcileTargets(g.target, g.board).complete ? "won-hand" : "playing" });
  };

  const gameOver = () => {
    const b = emptyBoard();
    const pat: TileTypeId[] = ["dot-1", "bam-2"];
    for (let i = 0; i < CELL_COUNT; i++) {
      const r = Math.floor(i / 4);
      const c = i % 4;
      b[i] = makeLooseFromType(pat[(r + c) % 2]);
    }
    onApply({ ...game, board: b, status: "game-over" });
  };

  const spawnTile = () => {
    const b = game.board.slice();
    const idx = b.findIndex((t) => t === null);
    if (idx >= 0) {
      b[idx] = makeLooseFromType(spawn);
      onApply({ ...game, board: b });
    }
  };

  const clearBoard = () => onApply({ ...game, board: emptyBoard(), status: "playing" });
  const reset = () => onApply(createInitialState());

  if (!open) {
    return (
      <button className="debug-fab" onClick={() => setOpen(true)} aria-label="Open debug panel">
        DBG
      </button>
    );
  }

  return (
    <div className="debug-panel" role="dialog" aria-label="Debug panel">
      <div className="debug-panel__head">
        <strong>Debug</strong>
        <button className="btn btn--ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="debug-grid">
        <button className="btn btn--sm" onClick={nearlyComplete}>Near-complete hand</button>
        <button className="btn btn--sm" onClick={fullHand}>Trigger MAHJ</button>
        <button className="btn btn--sm" onClick={gameOver}>Trigger game over</button>
        <button className="btn btn--sm" onClick={clearBoard}>Clear board</button>
        <button className="btn btn--sm" onClick={reset}>Fresh game</button>
      </div>

      <div className="debug-row">
        <label>
          Pattern:
          <select
            value={game.target.id}
            onChange={(e) => onApply(setTarget(game, e.target.value))}
          >
            {PATTERN_TEMPLATES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} — {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="debug-row">
        <label>
          Spawn:
          <select value={spawn} onChange={(e) => setSpawn(e.target.value as TileTypeId)}>
            {ALL_TILE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--sm" onClick={spawnTile}>Add tile</button>
      </div>
    </div>
  );
}
