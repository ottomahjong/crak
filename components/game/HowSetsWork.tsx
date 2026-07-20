"use client";

import { TileFace } from "@/components/tiles/TileFace";
import {
  makeLooseFromType,
  makePair,
  makePartialRun,
  makePung,
  makeRun,
} from "@/game/tiles";
import type { Tile } from "@/types";

// A one-screen visual reference: [tiles] + [tile] = [set]. No rules essay.
function Mini({ tile }: { tile: Tile }) {
  return (
    <div className="hsw-tile" data-set={tile.state === "completed"}>
      <div className="crak-tile__inner">
        <TileFace tile={tile} highContrast={false} learningLabel />
      </div>
    </div>
  );
}

function Plus() {
  return <span className="hsw-op">+</span>;
}
function Eq() {
  return <span className="hsw-op">=</span>;
}

export function HowSetsWork({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="How sets work">
      <div className="overlay__card hsw">
        <h2 className="hsw__title">How sets work</h2>
        <p className="hsw__sub">Each swipe moves tiles one space. Matching tiles that meet combine.</p>

        <div className="hsw__rows">
          <div className="hsw-row">
            <Mini tile={makeLooseFromType("dot-2", "a")} />
            <Plus />
            <Mini tile={makeLooseFromType("dot-2", "b")} />
            <Eq />
            <Mini tile={makePair({ suit: "dot", rank: 2 }, false, "c")} />
            <span className="hsw-name">Pair</span>
          </div>

          <div className="hsw-row">
            <Mini tile={makePair({ suit: "dot", rank: 2 }, false, "d")} />
            <Plus />
            <Mini tile={makeLooseFromType("dot-2", "e")} />
            <Eq />
            <Mini tile={makePung({ suit: "dot", rank: 2 }, false, "f")} />
            <span className="hsw-name">Pung</span>
          </div>

          <div className="hsw-row">
            <Mini tile={makeLooseFromType("bam-1", "g")} />
            <Plus />
            <Mini tile={makeLooseFromType("bam-2", "h")} />
            <Eq />
            <Mini tile={makePartialRun("bam", [1, 2], "i")} />
            <span className="hsw-name">Run started</span>
          </div>

          <div className="hsw-row">
            <Mini tile={makePartialRun("bam", [1, 2], "j")} />
            <Plus />
            <Mini tile={makeLooseFromType("bam-3", "k")} />
            <Eq />
            <Mini tile={makeRun("bam", false, "l")} />
            <span className="hsw-name">Run</span>
          </div>

          <div className="hsw-row">
            <Mini tile={makePair({ suit: "crak", rank: 1 }, false, "m")} />
            <Plus />
            <Mini tile={makeLooseFromType("joker", "n")} />
            <Eq />
            <Mini tile={makePung({ suit: "crak", rank: 1 }, true, "o")} />
            <span className="hsw-name">Joker fills in</span>
          </div>
        </div>

        <p className="hsw__foot">Fill every slot in your hand to call <b>Mahj</b>.</p>
        <button className="btn btn--primary" onClick={onClose} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}
