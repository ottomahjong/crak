# CRAK!

**A tiny mahjong puzzle.**

CRAK! is a mobile-first swipe puzzle. Slide the board, combine mahjong‑inspired
tiles into **pairs, pungs and runs**, and fill a small four‑slot **target hand**.
Call **MAHJ!**, roll into a slightly harder round, and keep going until the board
jams. One tap to play — no account, no backend, works offline.

It is an original game. The only thing borrowed from the genre is the broad idea
of a compact, swipe‑driven grid where every move matters. All artwork, code,
sounds, scoring and layout are original.

---

## Product overview

- **Platform:** Next.js (App Router) PWA, installable to an iPhone home screen.
- **Board:** 4×4, sixteen cells, large touch‑friendly tiles, safe‑area aware.
- **Input:** swipe (Pointer/Touch), arrow keys, WASD, on‑screen Undo & Menu.
- **Goal:** assemble combinations to satisfy all four target requirements, then
  the hand completes and a new (slightly harder) round begins on the same board.
- **Persistence:** everything is stored locally (`localStorage`). The active game
  survives a refresh; stats and settings persist across games.
- **Offline:** a service worker caches the app shell after first load.

## Tiles

Loose tiles (first release only):

- **Dots** `dot-1 dot-2 dot-3` — circular motif, cool blue accent
- **Bams** `bam-1 bam-2 bam-3` — bamboo strokes, green accent
- **Craks** `crak-1 crak-2 crak-3` — angular chevrons, coral accent
- **Dragons** `dragon-red dragon-green dragon-white` — bold geometric marks
- **Special** `joker` — gold, wild

No winds, flowers, or ranks 4–9 in this version.

## Game rules

**Pair** — two identical loose numbered tiles, or two identical dragons, fuse
into a pair (one cell).

**Pung** — a pair plus one more matching loose tile becomes a pung. Dragon pairs
become dragon pungs the same way. Pungs are terminal; there are no upgrades
beyond a pung, and no pair+pair or pung+anything merges.

**Run** — 1‑2‑3 of a single suit. Three contiguous same‑suit loose tiles collapse
into a run (any ordering of 1/2/3 is accepted once they’re adjacent). Completed
sets never participate in runs.

**Joker** — may substitute for exactly one missing loose tile to complete a pung,
a dragon pung, or a run. A joker cannot combine with another joker, cannot form a
pair, cannot fill more than one gap, and cannot upgrade a finished set. Jokers can
be toggled in Settings (default on).

### Combination‑resolution order (important)

For every valid swipe, each line (row/column) is resolved from the **leading
edge** (where tiles pile up) toward the trailing edge:

1. Empty cells are removed (tiles compact toward the swipe direction).
2. **Phase 1 — direct collisions:** pairs and pungs (including dragon pairs/pungs
   and pair‑plus‑joker) are formed greedily from the leading edge. A set created
   this move is **terminal** and does not chain further in the same move.
3. **Phase 2 — runs:** three contiguous *loose* same‑suit tiles (1‑2‑3, with a
   joker allowed to fill one gap) collapse into a run, again scanned from the
   leading edge.
4. Each source tile participates in **at most one** combination per move.
5. Pairs/pungs take priority over runs on a direct collision; completed sets are
   never eligible for runs.

After a valid move the engine, in order: resolves combinations → reconciles the
target hand → spawns one new tile → updates the score → checks for hand
completion → checks whether any legal move remains. An **invalid** swipe changes
nothing and spawns nothing.

The engine lives in pure TypeScript under `game/` and is covered by tests
(`tests/`). See `game/rules/combine.ts` for the authoritative resolution code.

## Target hands

Above the board, four explicit requirement slots (e.g. `ANY PAIR`, `DOT SET`,
`BAM RUN`, `DRAGON SET`). Patterns A–E live in `data/targets.ts`. A completed
board set fills the **most specific** unfilled slot first, is marked with a ribbon,
and never counts toward more than one slot. Fill all four to call **MAHJ!**

On hand completion: a bonus is awarded, the round and multiplier increase, a fresh
target is dealt, three low‑value loose tiles clear for breathing room (completed
sets are never removed), and play continues on the same board.

## Scoring

All constants live in `game/scoring.ts`:

| Event | Points |
| --- | --- |
| Pair | 25 |
| Numbered pung | 100 |
| Dragon pair | 50 |
| Dragon pung | 175 |
| Suited run | 125 |
| Target slot filled | +100 |
| Hand completed | 1000 × multiplier |
| Empty cells at hand completion | +20 each |
| Consecutive hands | multiplier grows +0.25 per hand |

## Tile spawning

A **fair‑bag** generator (`game/generator.ts`): a balanced, shuffled bag
(numbers common, dragons uncommon, joker rare) is drawn down and refilled. Each
bag gets light target‑aware weighting toward the suits the current hand needs.
Guards prevent more than three identical consecutive spawns and long stretches
with no target‑relevant tile. Randomness is a deterministic `mulberry32` state
stored in the game, so a game is reproducible and undo can restore RNG.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

## Test commands

```bash
npm test             # vitest — engine unit tests (44 tests)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (flat config)
```

Icons are generated (no binary assets committed except the PNGs they produce):

```bash
node scripts/gen-icons.mjs   # regenerate public/icons/*
```

## Production build

```bash
npm run build
npm start            # serve the production build locally
```

## Deploy to Vercel

The app needs **no environment variables** and **no backend**.

1. Push this repository to GitHub.
2. In Vercel, **New Project → Import** the repo.
3. Framework preset: **Next.js** (auto‑detected). Build command `next build`,
   output handled automatically. No env vars required.
4. Deploy. That’s it.

Alternatively, from the repo root: `npx vercel` (or `npx vercel --prod`).

## Install on iPhone (PWA)

1. Open the deployed URL in **Safari** on iPhone.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch “CRAK!” from the home screen — it runs standalone, in portrait, with
   safe‑area spacing, and works offline after the first load.

## Storage architecture

A single versioned key (`crak:v1`) in `localStorage` holds `{ version, settings,
stats, active }`:

- **settings** — sound, haptics, theme, reduced motion, high contrast, jokers,
  tutorial‑seen.
- **stats** — lifetime totals (games, best/average score, hands, pairs/pungs/runs/
  dragon sets, highest round, play time, per‑suit usage).
- **active** — the full current game (board, score, target + fulfilled slots,
  round, multiplier, spawn bag, RNG state, undo snapshot, elapsed time, status).

Reads are defensive: unknown/missing keys are merged with defaults, and a
malformed active game is discarded while stats/settings are preserved
(`lib/storage.ts`).

## Debug tools

Development builds always show a **DBG** panel; in production it appears only with
`?debug=1` in the URL. It can populate board states, force a target pattern, spawn
a chosen tile, trigger a near‑complete hand, trigger MAHJ, and trigger game over.
It never appears in normal production play.

## Architecture

```
app/               Next.js App Router, layout, global CSS, SW registration
components/game/    Board, Tile, TargetHand, TopBar, overlays, GameScreen, DebugPanel
components/tiles/    TileFace + original SVG suit/dragon/joker glyphs
components/screens/  Home, Pause, Statistics, Settings, Tutorial
components/ui/       Wordmark
data/               Target pattern library
game/               Pure rules engine (no React):
  game/tiles.ts       tile identity, predicates, constructors, labels
  game/rules/         combine.ts, movement.ts, targets.ts
  game/state/game.ts  init / move / undo / hand completion orchestration
  game/generator.ts   fair-bag spawner
  game/scoring.ts     scoring constants + helpers
hooks/              useGame (orchestration + persistence + feedback), useSwipe
lib/                storage, stats, audio (Web Audio), haptics, rng, layout
types/              shared domain types
tests/              vitest engine tests
public/             manifest.json, sw.js, generated icons
scripts/            gen-icons.mjs (pure-Node PNG icon generator)
```

The rules engine is deliberately independent of React so it can be reused or
ported later.

## Known limitations

- First‑release tile set only (no winds/flowers/4–9); target patterns are a small
  curated library.
- The tutorial teaches move → pair → run, then summarizes pungs, jokers, targets
  and MAHJ; it is intentionally short rather than exhaustive.
- Sound effects are simple generated Web Audio tones; there is no background music
  (the Settings music control is intentionally omitted since music isn’t shipped).
- Composite‑tile merge animation uses lightweight “ghost” slides rather than a full
  FLIP choreography.
- One free undo per game (by design).

## Future native iOS migration notes

The pure `game/` engine is portable. A future native SwiftUI app could reuse the
same rules (pairs/pungs/runs/joker, resolution order, fair‑bag spawner, scoring)
and add: Game Center leaderboards & achievements, StoreKit purchases, native
haptics, and cloud‑synced saves. None of those are implemented now, and nothing in
the engine depends on the web runtime.
