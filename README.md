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

## Movement — one swipe = one step

Every swipe moves each eligible tile **exactly one cell** in the chosen
direction — tiles never slide across the board to the far edge. A tile steps one
cell into an empty neighbour, **combines** with the neighbour it steps into if
they match, or **stays put** when blocked by the edge or an incompatible tile. A
tile takes **one action per swipe** (move *or* combine, never both, never twice),
and a set formed this swipe stays in its cell until the next swipe. If nothing
moved or combined, the swipe is invalid: nothing spawns, nothing is punished.

**Directional resolution.** Each row/column is resolved independently, from the
**leading edge** (the side tiles move toward) to the trailing edge. Leading-first
is what makes it deterministic and chain-free: by the time a tile is considered,
the cell ahead is already settled, so it can only step once. All of this lives in
`game/rules/movement.ts` (`applyMove`); tuning constants (one-cell distance,
swipe threshold, timings, spawn cadence, undo count) live in `game/config.ts`.

Examples (swipe left): `[_ _ 1 _]` → `[_ 1 _ _]` (one cell). `[1 _ _ _]` → no
change. `[1·Dot 2·Bam _ _]` → no change (edge + incompatible). `[1 1 _ _]` →
`[Pair _ _ _]` (adjacent match combines). `[1 _ 1 _]` → `[1 1 _ _]` (steps
closer; combines on a *later* swipe). `[1 1 1 _]` → `[Pair 1 _ _]` (no chain).

## Combination rules

**Pair** — two identical loose numbered tiles, or two identical dragons, fuse
into a pair (one cell).

**Pung** — a pair plus one more matching loose tile becomes a pung. Dragon pairs
become dragon pungs the same way. Pungs are terminal; there are no upgrades
beyond a pung, and no pair+pair or pung+anything merges.

**Run (two‑stage)** — every combination in CRAK! is a **two‑tile collision**, so
runs work exactly like pair→pung: slide `1`+`2` (or `2`+`3`) of one suit together
to make a visible **PARTIAL RUN**, then add the missing number to complete the
**RUN**. A lone `1` and `3` never combine (not adjacent). This replaced an older
three‑tile adjacency scan that behaved unlike anything else in the game — see
`docs/comprehension-audit.md` for the rationale.

**Joker** — completes a set that is one tile short: a pair → pung, a partial → run,
a dragon pair → dragon pung. A joker never *starts* a set (no joker pairs, no joker
partials), never combines with another joker, and never upgrades a finished set.

### The collision primitive

Every combination is `tryCombine(anchor, incoming)` — the single pairwise rule
the one-step engine applies when a tile steps into its forward neighbour:

- same rank → **pair**; adjacent ranks (same suit) → **partial run**; matching
  dragons → **dragon pair**;
- **pair** + matching tile (or joker) → **pung**; **partial run** + the missing
  rank (or joker) → **run** (terminal).

The result carries the anchor's id, so the composite set stays in the neighbour's
cell. It lives in `game/rules/combine.ts`. During learning hand 1 the run rule is
switched off (`RuleOptions.runs`) so partial runs can't appear before they're
taught.

**Spawn cadence.** Because one-cell movement takes more swipes to line tiles up,
a tile spawns only after **every 2nd non-combining swipe** (every **3rd** in
beginner/learning mode). Combining swipes never spawn (they already earn room).
The new tile enters from the **edge opposite the swipe**, after movement and any
combination finish, with an entrance slide and a brief "newest" ring. An invalid
swipe changes nothing and spawns nothing. This spawn rule (Option B in the brief)
was chosen by simulation over spawning every move — see *Balance & play-testing*.

**Undo.** Up to **three** undos per game (`CONFIG.UNDO_COUNT`), restoring the
exact board, score, target progress, spawn bag and RNG. Precise one-cell
placement means accidental swipes are cheap to take back; the remaining count is
shown on the Undo button. Undo history resets at each Mahj.

The engine lives in pure TypeScript under `game/` and is covered by tests
(`tests/`). See `game/rules/combine.ts` and `game/rules/movement.ts`.

## Learning by play (first game)

New players don't read rules — they start a **four‑hand learning game** that
introduces one concept at a time, teaching through play rather than text:

1. **Match tiles** — dots only. Make a pair, then a pung. Target: one pair + one
   pung. The opening board places the first pair one swipe away; runs are off.
2. **Build a run** — adds bams. Target adds a run (1+2 → partial, +3 → run).
3. **Dragons** — adds dragons and a dragon‑set slot.
4. **The Joker** — adds the wild, then unlocks endless mode.

Progress is saved locally (`tutorialSeen`), so it never repeats automatically;
**Settings → Replay learning game** restarts it. During learning, tiles show
`PAIR`/`PUNG`/`RUN` labels and target slots lead with plain language
(`TWO MATCHING TILES` above `Pair`). A simulation of 200 first games completes
hand 1 **100%** of the time with **zero** game‑overs (first pair ~move 1, first
Mahj median ~9 moves); see `tests/sim/learning.test.ts`.

**Guided Play** (on by default, toggle in Settings): after ~2 s idle, the tiles
that belong together get a subtle outline and a one‑line suggestion appears below
the hand ("Match the two 2 Dots", "One more set for Mahj"). Hints are computed in
`game/hints.ts` and are proven by test to only ever point at *legal* combinations.

A visual **How sets work** panel (from the game and pause menu) shows the
combinations as pictures: `[2 Dot]+[2 Dot]=[Pair]`, `[Pair]+[2 Dot]=[Pung]`,
`[1 Bam]+[2 Bam]=[Run…]`, `[Run…]+[3 Bam]=[Run]`, `[Pair]+[Joker]=[Pung]`.

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

## Tile spawning (where new tiles come from)

Every new tile **enters from the edge opposite the swipe** — swipe left and it
slides in from the right edge, swipe up and it drops from the bottom — landing in
an empty cell on that edge (or the nearest legal cell inward). It appears **only
after** the move and any combinations have finished animating, never in the same
frame as a merge, with its own entrance slide, a brief "newest tile" ring, and a
distinct soft sound. The three phases of a swipe — tiles move (~160 ms), sets
combine (~180 ms), a new tile enters (~160 ms) — are kept visually separate and
input is locked until the sequence finishes. A first‑time callout ("A new tile
entered from the right") shows for the first few swipes. Entry geometry lives in
`game/rules/movement.ts` (`entryLinesFor`/`entryEdgeFor`).

Which tile appears is a **fair‑bag** generator (`game/generator.ts`): a balanced,
shuffled bag
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

The app is a fully **static export** (`output: "export"`) — `next build` writes
the whole site to `out/`, no server or environment variables required.

```bash
npm run build                 # → out/
npx serve out                 # preview (any static file server works)
```

## Deploy to GitHub Pages

Deployment is automated by `.github/workflows/deploy.yml`.

1. In the repo, **Settings → Pages → Build and deployment → Source: GitHub
   Actions** (one‑time).
2. Push to the deploy branch (or merge to your default branch). The workflow
   type‑checks, runs the tests, builds the static export, and publishes it.
3. The site goes live at `https://<user>.github.io/crak/`.

**Subpath / base path.** A GitHub *project* site is served under `/<repo>/`, so
the build sets `basePath` from `PAGES_BASE_PATH` (default `/crak`, the repo
name). All asset, service‑worker, manifest and icon URLs are prefixed
accordingly. If you deploy to a **user/root site** or a **custom domain** (served
at `/`), set `PAGES_BASE_PATH` to an empty string in the workflow (and rename the
default in `next.config.mjs`). If your repo isn't named `crak`, change
`PAGES_BASE_PATH` to `/<your-repo>`.

> Note: the `github-pages` environment may restrict which branches can deploy. If
> the deploy step is blocked, either merge to your default branch or allow the
> branch under **Settings → Environments → github-pages → Deployment branches**.

## Install on iPhone (PWA)

1. Open the deployed URL (e.g. `https://<user>.github.io/crak/`) in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch “CRAK!” from the home screen — it runs standalone, in portrait, with
   safe‑area spacing, and works offline after the first load. The service worker
   is scoped to the subpath, so offline caching works under `/crak/` too.

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
