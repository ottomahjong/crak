"use client";

import { useMemo, useState } from "react";
import type { Board as BoardModel } from "@/types";
import { CELL_COUNT } from "@/types";
import { applyMove } from "@/game/rules/movement";
import { makeLooseFromType, newTileId } from "@/game/tiles";
import { Board } from "@/components/game/Board";
import { useKeyboard, useSwipe } from "@/hooks/useSwipe";
import { playSound, unlockAudio } from "@/lib/audio";

function emptyBoard(): BoardModel {
  return new Array(CELL_COUNT).fill(null);
}

type Step = {
  title: string;
  hint: string;
  board: BoardModel;
  // Success test given the resulting board of a move.
  success: (b: BoardModel) => boolean;
};

function buildSteps(): Step[] {
  const b1 = emptyBoard();
  b1[0] = makeLooseFromType("dot-1", newTileId());
  b1[2] = makeLooseFromType("bam-3", newTileId());

  const b2 = emptyBoard();
  b2[4] = makeLooseFromType("dot-2", newTileId());
  b2[7] = makeLooseFromType("dot-2", newTileId());

  const b3 = emptyBoard();
  b3[8] = makeLooseFromType("crak-1", newTileId());
  b3[9] = makeLooseFromType("crak-2", newTileId());
  b3[10] = makeLooseFromType("crak-3", newTileId());

  return [
    {
      title: "Swipe to move",
      hint: "Swipe any direction — every loose tile slides as far as it can.",
      board: b1,
      success: () => true,
    },
    {
      title: "Make a pair",
      hint: "Swipe so the two 2 Dots meet. Matching tiles fuse into a PAIR.",
      board: b2,
      success: (b) => b.some((t) => t?.setKind === "pair"),
    },
    {
      title: "Make a run",
      hint: "Slide 1·2·3 of one suit together to form a RUN.",
      board: b3,
      success: (b) => b.some((t) => t?.setKind === "run"),
    },
  ];
}

export function Tutorial({ onDone }: { onDone: () => void }) {
  const steps = useMemo(() => buildSteps(), []);
  const [i, setI] = useState(0);
  const [board, setBoard] = useState<BoardModel>(steps[0].board);
  const [done, setDone] = useState(false);
  const [combined, setCombined] = useState<Set<string>>(new Set());

  const finished = i >= steps.length;

  const handle = (dir: Parameters<typeof applyMove>[1]) => {
    if (finished || done) return;
    unlockAudio();
    const res = applyMove(board, dir);
    if (!res.changed) return;
    playSound(res.events.length ? "pair" : "move");
    setBoard(res.board);
    setCombined(new Set(res.events.map((e) => e.tile.id)));
    if (steps[i].success(res.board)) {
      setDone(true);
    }
  };

  const boardRef = useSwipe<HTMLDivElement>({ onSwipe: handle, enabled: !finished && !done });
  useKeyboard(handle, !finished && !done);

  const next = () => {
    const ni = i + 1;
    setDone(false);
    setCombined(new Set());
    if (ni >= steps.length) {
      setI(ni);
    } else {
      setI(ni);
      setBoard(steps[ni].board);
    }
  };

  if (finished) {
    return (
      <div className="screen tutorial">
        <div className="tutorial__info">
          <h2>That&apos;s the game</h2>
          <ul className="tut-list">
            <li><strong>Pair → Pung.</strong> Add a third matching tile to a pair.</li>
            <li><strong>Runs.</strong> 1·2·3 of a suit. A <span className="gold">Joker</span> can fill one gap.</li>
            <li><strong>Target hand.</strong> Fill all four slots up top…</li>
            <li><strong>…then call MAHJ!</strong> and roll into a harder round.</li>
          </ul>
          <button className="btn btn--primary btn--lg" onClick={onDone}>
            Start playing
          </button>
        </div>
      </div>
    );
  }

  const step = steps[i];
  return (
    <div className="screen tutorial">
      <div className="tutorial__head">
        <span className="tutorial__count">Step {i + 1} of {steps.length}</span>
        <button className="btn btn--ghost" onClick={onDone}>
          Skip
        </button>
      </div>
      <h2 className="tutorial__title">{step.title}</h2>
      <p className="tutorial__hint">{step.hint}</p>

      <div className="board-wrap board-wrap--tut">
        <Board
          ref={boardRef}
          board={board}
          ghosts={[]}
          newTileIds={new Set()}
          combinedIds={combined}
          highContrast={false}
          reducedMotion={false}
        />
      </div>

      <div className="tutorial__foot">
        {done ? (
          <button className="btn btn--primary btn--lg" onClick={next} autoFocus>
            {i + 1 >= steps.length ? "Finish" : "Next"}
          </button>
        ) : (
          <span className="tutorial__cue">↑ ↓ ← →  swipe or use arrow keys</span>
        )}
      </div>
    </div>
  );
}
