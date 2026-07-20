"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Suit, TargetRequirement, Tile, TileTypeId } from "@/types";
import { TileFace } from "@/components/tiles/TileFace";
import {
  explainRequirement,
  plainRequirementPhrase,
  shortRequirementLabel,
} from "@/data/targets";
import {
  makeKong,
  makeLooseFromType,
  makePair,
  makePung,
  makeQuint,
  makeRun,
} from "@/game/tiles";

// A worked example of the set a slot wants: the loose tiles that go in, and the
// completed set that comes out. Mirrors the "How sets work" language so a tap
// teaches exactly what THIS requirement is asking for.
function buildExample(req: TargetRequirement): { inputs: Tile[]; result: Tile } {
  const suit = (req.suit ?? "dot") as Suit;
  const loose = (t: TileTypeId) => makeLooseFromType(t);
  const n = (rank: number) => loose(`${suit}-${rank}` as TileTypeId);
  switch (req.kind) {
    case "any-pair":
      return { inputs: [loose("dot-2"), loose("dot-2")], result: makePair({ suit: "dot", rank: 2 }) };
    case "number-pung":
      return { inputs: [loose("bam-3"), loose("bam-3"), loose("bam-3")], result: makePung({ suit: "bam", rank: 3 }) };
    case "number-kong":
      return {
        inputs: [loose("dot-1"), loose("dot-1"), loose("dot-1"), loose("dot-1")],
        result: makeKong({ suit: "dot", rank: 1 }),
      };
    case "number-quint":
      return {
        inputs: Array.from({ length: 5 }, () => loose("crak-2")),
        result: makeQuint({ suit: "crak", rank: 2 }),
      };
    case "suited-run":
      return { inputs: [loose("bam-1"), loose("bam-2"), loose("bam-3")], result: makeRun("bam") };
    case "suit-run":
      return { inputs: [n(1), n(2), n(3)], result: makeRun(suit) };
    case "dragon-set":
      return { inputs: [loose("dragon-red"), loose("dragon-red")], result: makePair({ dragon: "red" }) };
    case "suit-set":
      return { inputs: [n(1), n(1), n(1)], result: makePung({ suit, rank: 1 }) };
    case "any-set":
      return { inputs: [loose("dot-1"), loose("dot-1"), loose("dot-1")], result: makePung({ suit: "dot", rank: 1 }) };
    default:
      return { inputs: [], result: makePair({ suit: "dot", rank: 1 }) };
  }
}

function MiniTile({ tile, set }: { tile: Tile; set?: boolean }) {
  return (
    <div className="reqm-tile" data-set={set ? "true" : undefined}>
      <div className="crak-tile__inner">
        <TileFace tile={tile} highContrast={false} compact />
      </div>
    </div>
  );
}

export function RequirementModal({
  req,
  done,
  onClose,
}: {
  req: TargetRequirement;
  done: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { inputs, result } = buildExample(req);
  const title = shortRequirementLabel(req);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="overlay__card reqm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reqm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reqm-title" className="reqm__title">
          {title}
          {done && <span className="reqm__done" aria-label="already complete">✓</span>}
        </h2>
        <p className="reqm__plain">{plainRequirementPhrase(req)}</p>

        <div className="reqm__example" aria-hidden>
          <div className="reqm__inputs">
            {inputs.map((t, i) => (
              <Fragment key={t.id}>
                {i > 0 && <span className="reqm__op">+</span>}
                <MiniTile tile={t} />
              </Fragment>
            ))}
          </div>
          <span className="reqm__op reqm__op--eq">=</span>
          <MiniTile tile={result} set />
        </div>

        <p className="reqm__explain">{explainRequirement(req)}</p>
        <button ref={closeRef} className="btn btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
