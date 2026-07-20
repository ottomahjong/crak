"use client";

import type { RackHand, Tile } from "@/types";

// The rack: hands you have banked from this wall. These tiles are SPENT — out of
// circulation for good — so the rack is both a trophy shelf and a running count
// of how efficiently you're using one finite wall. Each set is shown as a tiny
// colour-coded chip (glance value, not full detail — the board has that).

const SUIT_COLOR: Record<string, string> = {
  dot: "var(--suit-dot)",
  bam: "var(--suit-bam)",
  crak: "var(--suit-crak)",
};
const DRAGON_COLOR: Record<string, string> = {
  red: "var(--dragon-red)",
  green: "var(--dragon-green)",
  white: "var(--ink)",
};

function chipColor(t: Tile): string {
  if (t.usedJoker) return "var(--gold)";
  if (t.dragon) return DRAGON_COLOR[t.dragon] ?? "var(--ink)";
  if (t.suit) return SUIT_COLOR[t.suit] ?? "var(--ink)";
  return "var(--ink)";
}

/** One-glance label for a banked set. */
function chipLabel(t: Tile): string {
  if (t.setKind === "run") return "1·2·3";
  if (t.dragon) return t.dragon[0].toUpperCase();
  return String(t.rank ?? "");
}

const KIND_MARK: Record<string, string> = {
  pair: "", // 2 — bare
  pung: "•",
  kong: "••",
  quint: "•••",
  run: "",
};

function SetChip({ tile }: { tile: Tile }) {
  const color = chipColor(tile);
  const mark = KIND_MARK[tile.setKind ?? ""] ?? "";
  return (
    <span className="rack-chip" style={{ color }}>
      <span className="rack-chip__label">{chipLabel(tile)}</span>
      {mark && <span className="rack-chip__mark">{mark}</span>}
    </span>
  );
}

export function Rack({ hands }: { hands: RackHand[] }) {
  if (hands.length === 0) return null;
  return (
    <div className="rack" aria-label={`Rack: ${hands.length} hands banked`}>
      <span className="rack__count">{hands.length}★</span>
      <div className="rack__scroll">
        {hands.map((hand) => (
          <div className="rack-hand" key={hand.id} title={`${hand.name} · round ${hand.round}`}>
            {hand.tiles.map((t) => (
              <SetChip tile={t} key={t.id} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
