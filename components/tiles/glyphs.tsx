import type { DragonColor, Suit } from "@/types";

// Original geometric suit / dragon / joker marks. All monochrome via
// currentColor so the parent controls the accent. No traditional artwork.

export function SuitGlyph({ suit, size = 24 }: { suit: Suit; size?: number }) {
  const s = size;
  switch (suit) {
    case "dot":
      // A ring with a centre dot — "circle" motif.
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </svg>
      );
    case "bam":
      // Stylised bamboo stalk with two nodes.
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="9" y="3" width="6" height="18" rx="3" stroke="currentColor" strokeWidth="2.2" />
          <line x1="9" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="2.2" />
          <line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      );
    case "crak":
      // Angular double-chevron.
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 4 L15 12 L7 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 4 L21 12 L13 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        </svg>
      );
  }
}

export function DragonGlyph({ dragon, size = 28 }: { dragon: DragonColor; size?: number }) {
  const s = size;
  switch (dragon) {
    case "red":
      // Filled diamond.
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" />
          <path d="M12 7 L16.5 12 L12 17 L7.5 12 Z" fill="#fff" opacity="0.85" />
        </svg>
      );
    case "green":
      // Leaf / upward triangle.
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2 L21 20 L3 20 Z" fill="currentColor" />
          <path d="M12 9 L16 18 L8 18 Z" fill="#fff" opacity="0.8" />
        </svg>
      );
    case "white":
      // Hollow ring.
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
          <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      );
  }
}

export function JokerGlyph({ size = 28 }: { size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 1.5 L14.6 8.2 L21.5 8.2 L15.9 12.4 L18.1 19 L12 15 L5.9 19 L8.1 12.4 L2.5 8.2 L9.4 8.2 Z"
        fill="currentColor"
      />
    </svg>
  );
}
