import type { Suit, Tile } from "@/types";
import { tileLabel } from "@/game/tiles";
import { DragonGlyph, JokerGlyph, SuitGlyph } from "./glyphs";

// Accent colors per suit / dragon. Kept restrained.
const SUIT_COLOR: Record<Suit, string> = {
  dot: "var(--suit-dot)",
  bam: "var(--suit-bam)",
  crak: "var(--suit-crak)",
};

function accentFor(tile: Tile): string {
  if (tile.isJoker) return "var(--gold)";
  if (tile.dragon === "red") return "var(--dragon-red)";
  if (tile.dragon === "green") return "var(--dragon-green)";
  if (tile.dragon === "white") return "var(--ink)";
  if (tile.suit) return SUIT_COLOR[tile.suit];
  return "var(--ink)";
}

function LooseFace({ tile, highContrast }: { tile: Tile; highContrast: boolean }) {
  const accent = accentFor(tile);

  if (tile.isJoker) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center" style={{ color: accent }}>
        <JokerGlyph size={30} />
        <span className="tile-label">JOKER</span>
      </div>
    );
  }

  if (tile.dragon) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center" style={{ color: accent }}>
        <DragonGlyph dragon={tile.dragon} size={30} />
        <span className="tile-label">{tile.dragon.toUpperCase()}</span>
      </div>
    );
  }

  // Numbered tile: big numeral + suit glyph badge + label.
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center" style={{ color: accent }}>
      <div className="absolute left-1 top-1" style={{ opacity: 0.9 }}>
        <SuitGlyph suit={tile.suit!} size={16} />
      </div>
      <span
        className="font-display leading-none"
        style={{ fontSize: "clamp(20px, 7vw, 34px)", fontWeight: 700 }}
      >
        {tile.rank}
      </span>
      <span className={highContrast ? "tile-label tile-label--hc" : "tile-label"}>
        {tile.suit!.toUpperCase()}
      </span>
    </div>
  );
}

function Mini({ tile }: { tile: Tile }) {
  if (tile.dragon) return <DragonGlyph dragon={tile.dragon} size={14} />;
  if (tile.suit) return <SuitGlyph suit={tile.suit} size={14} />;
  return null;
}

const RIBBON: Record<string, string> = {
  pair: "PAIR",
  pung: "PUNG",
  kong: "KONG",
  quint: "QUINT",
  run: "RUN",
  partial: "RUN…",
};

// How many glyph pips a completed set shows.
const SET_COUNT: Record<string, number> = {
  pair: 2,
  pung: 3,
  kong: 4,
  quint: 5,
  run: 3,
};

function CompletedFace({
  tile,
  learningLabel,
  compact,
}: {
  tile: Tile;
  learningLabel?: boolean;
  compact?: boolean;
}) {
  const accent = accentFor(tile);
  const kind = tile.setKind!;
  const label = learningLabel ? RIBBON[kind] ?? kind.toUpperCase() : kind.toUpperCase();

  // Compact rendering (rules modal / small reference tiles): everything is
  // laid out in-flow so the label can never overlap the numerals. Sizes are
  // fixed-px so they stay legible at ~52-60px tiles.
  if (compact) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center"
        style={{ color: accent, gap: "1px", lineHeight: 1 }}
      >
        <span className="composite-ribbon composite-ribbon--flow">{label}</span>
        {kind === "partial" && tile.partRanks ? (
          <div className="flex items-end font-display font-bold" style={{ fontSize: "16px", gap: "2px" }}>
            <span>{tile.partRanks[0]}</span>
            <span>{tile.partRanks[1]}</span>
            <span className="partial-need" style={{ fontSize: "12px" }}>
              +{tile.partRanks.includes(1) ? (tile.partRanks.includes(2) ? 3 : 2) : 1}
            </span>
          </div>
        ) : kind === "run" ? (
          <div className="flex items-end font-display font-bold" style={{ fontSize: "16px", gap: "2px" }}>
            <span>1</span>
            <span style={{ opacity: 0.7 }}>2</span>
            <span style={{ opacity: 0.5 }}>3</span>
          </div>
        ) : (
          <span className="font-display font-bold" style={{ fontSize: "18px", lineHeight: 1 }}>
            {tile.rank ?? ""}
          </span>
        )}
        <div className="flex items-center justify-center" style={{ gap: "1px" }}>
          {Array.from({ length: Math.min(SET_COUNT[kind] ?? 3, 3) }).map((_, i) => (
            <Mini key={i} tile={tile} />
          ))}
          {tile.usedJoker && (
            <span style={{ color: "var(--gold)", fontSize: "11px", marginLeft: "1px" }} aria-hidden>
              ★
            </span>
          )}
        </div>
      </div>
    );
  }

  // Partial run: show the two ranks + a faded "needs N" so the next step reads.
  if (kind === "partial" && tile.partRanks) {
    const need = tile.partRanks.includes(1)
      ? tile.partRanks.includes(2)
        ? 3
        : 2
      : 1;
    return (
      <div
        className="relative flex h-full w-full flex-col items-center justify-center gap-0.5"
        style={{ color: accent }}
      >
        <span className="composite-ribbon">RUN…</span>
        <div className="flex items-end gap-0.5 font-display font-bold" style={{ fontSize: "clamp(13px, 4.5vw, 20px)" }}>
          <span>{tile.partRanks[0]}</span>
          <span>{tile.partRanks[1]}</span>
          <span className="partial-need">+{need}</span>
        </div>
        <div className="flex items-center justify-center gap-0.5">
          <Mini tile={tile} />
        </div>
      </div>
    );
  }

  // Cap the glyph pips at 3; the KONG/QUINT ribbon conveys the true count.
  const count = Math.min(SET_COUNT[kind] ?? 3, 3);
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-0.5" style={{ color: accent }}>
      <span className="composite-ribbon">{label}</span>

      {kind === "run" ? (
        <div className="flex items-end gap-0.5 font-display font-bold" style={{ fontSize: "clamp(13px, 4.5vw, 20px)" }}>
          <span>1</span>
          <span style={{ opacity: 0.7 }}>2</span>
          <span style={{ opacity: 0.5 }}>3</span>
        </div>
      ) : (
        <span className="font-display font-bold leading-none" style={{ fontSize: "clamp(18px, 6vw, 28px)" }}>
          {tile.rank ?? ""}
        </span>
      )}

      <div className="flex items-center justify-center gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <Mini key={i} tile={tile} />
        ))}
      </div>

      {tile.usedJoker && <span className="joker-flag" aria-hidden>★</span>}
      {tile.usedForTarget && (
        <span className="target-ribbon" aria-label="counted toward target">
          ✓
        </span>
      )}
    </div>
  );
}

export function TileFace({
  tile,
  highContrast,
  learningLabel,
  compact,
}: {
  tile: Tile;
  highContrast: boolean;
  learningLabel?: boolean;
  compact?: boolean;
}) {
  return (
    <>
      <span className="sr-only">{tileLabel(tile)}</span>
      {tile.state === "loose" ? (
        <LooseFace tile={tile} highContrast={highContrast} />
      ) : (
        <CompletedFace tile={tile} learningLabel={learningLabel} compact={compact} />
      )}
    </>
  );
}
