# CRAK! comprehension audit

Audit of the pre-overhaul build, performed before the teach-through-play redesign.
Every observation below was verified against the implementation (engine in
`game/`, presentation in `components/` and `hooks/useGame.ts`).

## 1. Exact gameplay flow (pre-overhaul)

1. **New game** — `createInitialState` deals target pattern `OPEN`, primes the
   fair bag, and spawns **4 loose tiles into random empty cells** drawn from the
   full 13-type pool (numbers ×9, dragons ×3, joker).
2. **Initial placement** — random cells; nothing guarantees an early combination.
3. **First new tile** — ~2.5% flat joker roll, else 66% "reinforcement" pick
   (a tile that combines with the board), else fair-bag draw.
4. **Where it enters** — a **uniformly random empty cell anywhere** on the board.
5. **After each swipe** — engine resolves atomically: move → combine → reconcile
   targets → spawn → score → status. The UI applied all of it in **one frame**:
   slide ghosts, merge pop, and the spawn's scale-in all overlap.
6. **Direct merges** — pairwise collisions from the leading edge: same tile +
   same tile → PAIR; PAIR + matching tile (or joker) → PUNG. Terminal.
7. **Runs** — a **second scanning phase**: any three *contiguous* loose tiles of
   one suit whose ranks form {1,2,3} (joker may fill one gap) collapse into a
   RUN. Formed by a different mechanism than everything else in the game.
8. **Jokers** — substitute in pung, dragon pung, or run; may appear from move 1.
9. **Target matching** — after every move, `reconcileTargets` silently assigns
   completed sets to slots, most-specific-first, keeps prior assignments stable.
   No feedback beyond a checkmark appearing.
10. **Mahj** — all slots filled → status `won-hand` → overlay. The four
    fulfilling sets are cashed in (removed); loose tiles carry over.

## 2. Invisible-rule audit table

| # | Current behavior | What the player likely assumes | Why it's confusing | Correction |
|---|---|---|---|---|
| 1 | New tile spawns in a random cell anywhere | "Tiles appear at random / I caused that somehow" | No spatial logic; spawn is invisible among 16 cells and lands mid-frame | Spawn **from the edge opposite the swipe**, after movement finishes, with an entrance slide + newest-tile ring + distinct sound |
| 2 | Runs form via a 3-tile adjacency scan | "Tiles combine when they hit each other" (learned from pairs) | Only mechanic that is not a two-tile collision; order-dependent; pairs silently block runs | **Two-stage runs**: 1+2 (or 2+3) collide → visible PARTIAL RUN tile; partial + missing rank (or joker) → RUN. Every combination in the game is now a two-tile collision |
| 3 | Move, merge and spawn resolve in one visual frame | "Something changed, not sure what" | Three events with no sequencing; the spawn is indistinguishable from a merge product | Three visible phases: move (~150 ms) → merge pop → spawn entrance (~150 ms after a ~240 ms beat); input locked until legible |
| 4 | Full 13-type pool from move 1 | "I should understand all of these" | Dots+bams+craks+3 dragons+joker at once ≈ 13 concepts before the first merge | **Learning game**: hand 1 dots only, hand 2 +bams/runs, hand 3 +dragons, hand 4 +joker, then endless |
| 5 | Targets labeled "NUMBER PUNG", "DRAGON SET" | "…what is a pung?" | Mahjong jargon with no definition anywhere in the game UI | Plain-language-first labels during learning ("THREE MATCHING TILES / Pung"); tap any slot anytime for a one-line explanation + mini example |
| 6 | Target slots fill silently | "Why did that checkmark appear?" / misses it entirely | The single most important causal link (set → hand) is never shown | Explicit feedback: slot pops, board set marked, message "Pair completed — 2 of 4 sets" |
| 7 | Sets that match no slot just sit there | "Did I do something wrong?" | No acknowledgment; looks like a failed match | Message "Useful set — points, but not part of this hand"; ribbon distinguishes used vs unused sets |
| 8 | Joker may spawn in the first minutes | "A star tile? What does it do?" | Wild-card semantics before basic merging is understood | Joker excluded until learning hand 4; introduced with its own hand |
| 9 | No guidance at any point | "What should I even do?" | The link from "make sets" to "fill the hand" to "Mahj" is inferred | Guided Play: idle hints outline combinable tiles + one-line next-move suggestion; "One more set for Mahj" state |
| 10 | First game = full endless difficulty | Player churns before first Mahj | Even the easy opener assumes the whole rule set | Learning hand 1 needs only a pair + a pung of dots, first Mahj in ~8 moves |

## 3. Five largest causes of confusion (ranked most → least harmful)

1. **Invisible, unpredictable tile spawning.** A tile materializing in a random
   cell during the same frame as merges breaks cause-and-effect — the single
   worst offender, because it corrupts the player's model of *every* move.
2. **Run formation used a different physics than everything else.** Pairs teach
   "two tiles collide"; runs then require a mental 3-window scan the player has
   never seen. (Also the least predictable code path.)
3. **Everything at once.** 13 tile types, 4 target concepts, jargon labels, and
   jokers in the first 30 seconds.
4. **Silent target matching.** The core loop (sets fill the hand → Mahj) was
   never *shown*, only implied by a small checkmark.
5. **No next-step signal.** Nothing between "here is a board" and "reach Mahj"
   ever suggested what to try, so stalling felt like the game's fault.

## 4. Rule changes made (and why)

### Runs: two-stage formation (changed)
Old: three contiguous same-suit tiles {1,2,3} collapse in a second scan phase.
New: **1+2 or 2+3 collide → PARTIAL RUN tile ("1·2", needs 3). Partial + missing
rank (or joker) → RUN.**
Both systems were evaluated (see brief): the two-stage system wins because it
makes *every* combination in the game a two-tile collision — one universal rule
("tiles that belong together combine when they touch"), mirroring pair→pung.
It is less faithful to physical Mahjong but strictly easier to predict, and it
gives runs visible intermediate progress. 1+3 do **not** combine (not adjacent);
the generator knows to supply the 2. Jokers complete a partial but cannot start
one (same law as pairs: jokers finish sets, never begin them).

### Pairs stay as composite tiles (Approach A, kept deliberately)
Approach B (visual grouping without a composite) was assessed and rejected:
pairs are themselves target requirements ("ANY PAIR"), so they must exist as
discrete objects the hand can point at; a composite pair also occupies one cell
(fairer on a 16-cell board) and is the natural stepping stone that two-stage
runs now mirror. This is a re-evaluation, not inertia.

### Spawning: edge-entry (changed)
New tiles enter **from the edge opposite the swipe direction** (swipe left →
enters at the right edge), in an empty cell on that edge, or the nearest legal
cell inward — and visibly slide in from that edge after movement completes.

### Learning gating (new)
Learning hand 1 disables the run rule entirely (1+2 slide past each other) so
partials cannot appear before they are taught. Pools per hand: dots → +bams →
+dragons → +joker. Hand 1's opening board is a fixed layout whose first pair is
one swipe away.

## 5. Remaining known confusion risks

- A set filling a slot is highlighted + messaged, but there is no literal
  "flying copy" animation from board to slot yet.
- In endless mode a 2 colliding with a neighboring 1 forms a partial even when
  the player wanted to pair 2s — deterministic ("first tile it touches wins")
  but can surprise once.
- Hard-tier hands (three runs / three suits) remain a genuine wall by design.
- The swipe *preview* is approximated by Guided Play's idle hints rather than a
  live drag preview.
