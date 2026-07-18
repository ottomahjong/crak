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
target hand → **spawns one new tile unless the move made a combination** →
updates the score → checks for hand completion → checks whether any legal move
remains. An **invalid** swipe changes nothing and spawns nothing.

**Breathing room (why combining skips the spawn).** On a 16-cell board with 13
tile types, spawning after *every* move floods the grid with un-combinable
tiles before a four-set hand can be assembled. So any move that makes a
combination skips that turn's spawn — combining is what buys you room, and
"dead" slides that only shuffle tiles keep the board advancing. This is the
central balance lever (see *Balance & play-testing*).

The engine lives in pure TypeScript under `game/` and is covered by tests
(`tests/`). See `game/rules/combine.ts` for the authoritative resolution code.

## Target hands

Above the board, four explicit requirement slots (e.g. `ANY PAIR`, `ANY SET`,
`DOT SET`, `DRAGON SET`). Patterns live in `data/targets.ts` (eight of them), each tagged with a
**difficulty** (1–3) and dealt on a **ramp**: **rounds 1–2 are always easy**
(two openers you can reliably bank), rounds 3–6 add the medium tier
(pungs, a dragon set), and hard hands (three suits, multiple runs, run + dragon)
only appear from round 7+ (or occasionally rounds 5–6). This is what turns a run
from "one hand then dead" into a real progression. A completed board set fills the **most specific**
unfilled slot first, is marked with a ribbon, and never counts toward more than
one slot. Fill all four to call **MAHJ!**

On hand completion: a bonus is awarded, the round and multiplier increase, and
the **four sets that fulfilled the hand are cashed in** — removed from the board,
which is what creates breathing room for the next round. Loose tiles and any
extra unspent sets carry over as a head start. Because scored sets leave the
board, no set can ever be counted toward two hands (no degenerate cascades), and
the difficulty ramp is what gradually tightens the game.

## Scoring

All constants live in `game/scoring.ts`:

| Event | Points |
| --- | --- |
| Pair | 20 |
| Numbered pung | 120 |
| Dragon pair | 45 |
| Dragon pung | 200 |
| Suited run | 140 |
| Target slot filled | +120 |
| Hand completed | 600 × multiplier |
| Empty cells at hand completion | +15 each |
| Consecutive hands | multiplier grows +0.2 per hand |

Pungs and runs are scored highest because they consume the most tiles and free
the most space — the plays that actually sustain a run.

## Tile spawning

A **fair‑bag** generator (`game/generator.ts`): a balanced, shuffled bag
(numbers common, dragons uncommon, joker rare) is drawn down and refilled, with
target‑aware weighting toward the suits the current hand needs and a **dragon
focus** (when a dragon set is required, one colour is emphasised so a dragon
pair/pung is actually reachable — dragons are otherwise far too sparse to pair).

On top of the bag, ~66% of spawns are **reinforcement** draws: a tile chosen to
combine with what's already on the board (complete a pung from a pair, fill a
1‑2‑3 run gap, or pair up a lone tile). Without this, random spawns over 13 tile
types simply pile up as junk. Reinforcement diversifies away from the
just‑spawned tile so no single type floods the board (identical spawns are
capped at three in a row). A small flat **Joker** chance (~4%) sits on top so the
taught wild mechanic actually appears — about one or two per game. The remaining
fraction stays fair‑bag random for variety. Randomness is a deterministic
`mulberry32` state stored in the game, so a game is reproducible and undo can
restore RNG.

---

## Balance & play-testing

The rules engine is pure and React-free, so it can be play-tested headlessly. A
heuristic-AI harness (`tests/sim/harness.ts`) plays full games and reports
balance metrics; `tests/sim/report.test.ts` runs a batch (150 games by default,
`SIM_N=500 npm test` for more) and asserts health bounds so a regression in the
tuning fails CI.

The first pass exposed five problems and the fixes that followed:

| # | Problem (baseline, 200 games) | Fix |
| --- | --- | --- |
| 1 | Games ended in ~16 moves; **99.5% completed no hand** | Spawn is skipped on any combining move (breathing room) |
| 2 | Dragon sets impossible (**2 in 200 games**) | Bag "dragon focus" emphasises one colour when a dragon set is needed |
| 3 | Board drowned in loose tiles (13/16 at game over) | ~66% reinforcement spawns keep the board combinable |
| 4 | No ramp; every hand demanded 4 hard sets incl. a run | Difficulty-tiered patterns; easy opener needs no run |
| 5 | Pungs slow, generation luck-heavy | Reinforcement completes pungs/runs; scoring rewards them |

A **second pass** play-tested the balanced build and fixed the largest remaining
problems:

| # | Problem | Fix |
| --- | --- | --- |
| 1 | **Soft-lock**: a hand made entirely of its four scoring sets emptied the board on cash-in (~2.5% of games dead-locked) | `completeHand` tops the board back up to a playable minimum |
| 2 | Difficulty cliff: **62% of runs died at exactly one hand** (round 2 was always a medium) | Rounds 1–2 are now both easy; two new easy/medium patterns added |
| 3 | Miscalibrated tiers (SUITS 22%, GATE-with-run 25% sat beside TWINS 55%) | Genuinely hard hands moved to tier 3; tier 2 now clusters ~40–50% |
| 4 | **Jokers nearly absent** (1.7% of spawns) despite being taught | Small flat joker spawn chance → ~4% (one or two per game) |
| 5 | Short average run length (median 1 hand) | Gentler ramp + tier fixes lift the median run to two hands |

Result (300-game batch, heuristic AI) after both passes:

- Hand-completion rate: **~90%** of games reach at least one MAHJ (opener ~86%)
- Moves per game: **median ~49**, p90 ~81, skilled tail 120+
- Hands per game: **median 2**, p90 4, tail to 9–10 (mode is 2 hands)
- "Died at exactly one hand": **62% → ~23%**
- Tiers: easy 71–86%, medium ~40–50%, hard ~0–40% (the mastery ceiling)
- Jokers ~4% of spawns; identical spawns capped at **3** in a row
- **0** soft-locks, **0** games run forever, **0%** degenerate cascades

Movement and combination resolution are verified **deterministic** (same seed →
identical board/score trajectory) by both the unit tests and a simulation test.
`tests/sim/report.test.ts` asserts health bounds (median moves ≥ 35, median
hands ≥ 2, ≥ 75% reach a MAHJ, spawn streaks ≤ 4, no cascades) so the tuning
cannot silently regress.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

## Test commands

```bash
npm test             # vitest — engine + simulation tests (54 tests)
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
tests/sim/          headless play-testing harness + balance regression
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
