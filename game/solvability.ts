import type {
  Board,
  DragonColor,
  GameState,
  Rank,
  SolvabilityResult,
  Suit,
  TargetHand,
  TargetRequirement,
  TileDefinition,
  TileTypeId,
} from "@/types";
import { SUITS, DRAGONS } from "@/game/tiles";
import { hasAnyMove } from "@/game/rules/movement";
import { learningPool, ruleOptsFor } from "@/game/rules/options";

// ---------------------------------------------------------------------------
// Formal solvability / fairness analysis
// ---------------------------------------------------------------------------
//
// evaluateHandSolvability answers ONE question: can this target hand still be
// completed from where the game is now? It is used in two places:
//
//   • before a target is presented — a hand that cannot be built (a required
//     tile family is locked out, or Kongs aren't unlocked) is never dealt;
//   • before every spawn — if a required tile is starving, the fair-bag
//     generator is steered to supply it, so a run never dies of bad luck.
//
// The check is deliberately conservative and DETERMINISTIC (no randomness). It
// separates HARD feasibility (is a recipe possible at all, given the allowed
// tile pool and whether Kongs are unlocked?) from SOFT confidence (how close is
// the board, and does the near-term supply cover what's still needed?).
//
// The dominating fact about CRAK!'s supply is that the generator reinforces the
// board: given empty cells to spawn into, any ALLOWED tile can still arrive.
// So a requirement is hard-infeasible only when its whole tile family is
// disallowed (learning restriction) or it needs a Kong/Quint before those are
// unlocked — or when the board is a terminal dead end with no room to build.

const NUMBER_TYPES: TileTypeId[] = [
  "dot-1", "dot-2", "dot-3",
  "bam-1", "bam-2", "bam-3",
  "crak-1", "crak-2", "crak-3",
];

/** How many identical tiles a same-tile set needs. */
const SAME_TILE_COUNT: Record<string, number> = { pair: 2, pung: 3, kong: 4, quint: 5 };

type Ctx = {
  /** Effective copies of each number tile: loose tiles + tiles locked inside
   *  unassigned number sets of that identity (a pung of dot-2 = 3 copies). */
  numberHeld: Map<TileTypeId, number>;
  /** Effective copies of each dragon colour, same accounting. */
  dragonHeld: Map<DragonColor, number>;
  /** Ranks already present per suit (loose, partial or completed) — for runs. */
  suitRanks: Map<Suit, Set<Rank>>;
  jokers: number;
  allowed?: ReadonlySet<TileTypeId>;
  kongsEnabled: boolean;
};

function ok(ctx: Ctx, t: TileTypeId): boolean {
  return !ctx.allowed || ctx.allowed.has(t);
}

/** Effective copies a tile contributes toward a matching set (loose = 1, a
 *  completed same-tile set contributes its full count so we can extend it). */
function tileContribution(state: string, setKind?: string): number {
  if (state === "loose") return 1;
  return SAME_TILE_COUNT[setKind ?? ""] ?? 0;
}

/** Build the accounting context from a board plus the tiles still to arrive. */
function buildCtx(board: Board, futureBag: TileDefinition[], gs: GameState): Ctx {
  const numberHeld = new Map<TileTypeId, number>();
  const dragonHeld = new Map<DragonColor, number>();
  const suitRanks = new Map<Suit, Set<Rank>>();
  for (const s of SUITS) suitRanks.set(s, new Set());
  let jokers = 0;

  const addNumber = (suit: Suit, rank: Rank, n: number) => {
    const key = `${suit}-${rank}` as TileTypeId;
    numberHeld.set(key, (numberHeld.get(key) ?? 0) + n);
    suitRanks.get(suit)!.add(rank);
  };

  for (const t of board) {
    if (!t) continue;
    if (t.state === "loose") {
      if (t.isJoker) jokers++;
      else if (t.dragon) dragonHeld.set(t.dragon, (dragonHeld.get(t.dragon) ?? 0) + 1);
      else if (t.suit && t.rank) addNumber(t.suit, t.rank, 1);
      continue;
    }
    // Completed / partial sets: count their locked tiles toward the identity.
    const n = tileContribution(t.state, t.setKind);
    if (t.setKind === "partial" && t.suit && t.partRanks) {
      for (const r of t.partRanks) addNumber(t.suit, r, 1);
    } else if (t.setKind === "run" && t.suit) {
      for (const r of [1, 2, 3] as Rank[]) addNumber(t.suit, r, 1);
    } else if (t.suit && t.rank) {
      addNumber(t.suit, t.rank, n);
    } else if (t.dragon) {
      dragonHeld.set(t.dragon, (dragonHeld.get(t.dragon) ?? 0) + n);
    }
  }

  // Near-term supply from the bag counts toward what's reachable.
  for (const type of futureBag) {
    if (type === "joker") jokers++;
    else if (type.startsWith("dragon-")) {
      const c = type.split("-")[1] as DragonColor;
      dragonHeld.set(c, (dragonHeld.get(c) ?? 0) + 1);
    } else {
      const [suit, rankStr] = type.split("-");
      addNumber(suit as Suit, Number(rankStr) as Rank, 1);
    }
  }

  const opts = ruleOptsFor(gs);
  return {
    numberHeld,
    dragonHeld,
    suitRanks,
    jokers,
    allowed: learningPool(gs.learning),
    kongsEnabled: opts.kongs === true,
  };
}

type ReqEval = {
  feasible: boolean;
  /** Real tiles still needed for the cheapest recipe, by type. */
  need: Map<TileTypeId, number>;
  /** Concrete progress 0..1 toward the cheapest recipe (for confidence). */
  progress: number;
  reason?: string;
};

/** Best same-tile number set (pung/kong/quint) progress across all identities. */
function bestNumberSet(ctx: Ctx, count: number): ReqEval {
  let best: ReqEval | null = null;
  const numbers = NUMBER_TYPES.filter((t) => ok(ctx, t));
  if (numbers.length === 0) {
    return { feasible: false, need: new Map(), progress: 0, reason: "No number tiles available" };
  }
  for (const type of numbers) {
    const held = ctx.numberHeld.get(type) ?? 0;
    const missing = Math.max(0, count - held);
    // Jokers can fill all but the first two real tiles (a pair must be real).
    const realFloor = Math.min(count, 2);
    const realNeeded = Math.max(0, realFloor - held);
    const need = new Map<TileTypeId, number>();
    if (missing > 0) need.set(type, missing);
    const progress = Math.min(1, held / count);
    const cand: ReqEval = { feasible: realNeeded <= Math.max(0, count - held) + ctx.jokers, need, progress };
    if (!best || cand.progress > best.progress) best = cand;
  }
  return best!;
}

/** Best run progress across suits (or a specific suit). */
function bestRun(ctx: Ctx, suit?: Suit): ReqEval {
  const suits = suit ? [suit] : SUITS;
  let best: ReqEval | null = null;
  for (const s of suits) {
    if (![1, 2, 3].some((r) => ok(ctx, `${s}-${r}` as TileTypeId))) continue;
    const have = ctx.suitRanks.get(s) ?? new Set<Rank>();
    const missing = ([1, 2, 3] as Rank[]).filter((r) => !have.has(r));
    const need = new Map<TileTypeId, number>();
    for (const r of missing) need.set(`${s}-${r}` as TileTypeId, 1);
    const progress = (3 - missing.length) / 3;
    // A joker can substitute at most one missing rank.
    const feasible = missing.length - (ctx.jokers > 0 ? 1 : 0) <= missing.length;
    const cand: ReqEval = { feasible, need, progress };
    if (!best || cand.progress > best.progress) best = cand;
  }
  if (!best) return { feasible: false, need: new Map(), progress: 0, reason: `No ${suit ?? ""} run possible` };
  return best;
}

/** Best dragon set (pair suffices) across colours. */
function bestDragonSet(ctx: Ctx): ReqEval {
  const colors = DRAGONS.filter((c) => ok(ctx, `dragon-${c}` as TileTypeId));
  if (colors.length === 0) {
    return { feasible: false, need: new Map(), progress: 0, reason: "No dragon tiles available" };
  }
  let best: ReqEval | null = null;
  for (const c of colors) {
    const held = ctx.dragonHeld.get(c) ?? 0;
    const missing = Math.max(0, 2 - held);
    const need = new Map<TileTypeId, number>();
    if (missing > 0) need.set(`dragon-${c}` as TileTypeId, missing);
    const progress = Math.min(1, held / 2);
    const cand: ReqEval = { feasible: true, need, progress };
    if (!best || cand.progress > best.progress) best = cand;
  }
  return best!;
}

/** Best any-set: a pung (3 same) or a run, whichever is closer. */
function bestAnySet(ctx: Ctx): ReqEval {
  const pung = bestNumberSet(ctx, 3);
  const run = bestRun(ctx);
  const dragon = bestDragonSet(ctx); // a dragon pung also counts as any-set? No — any-set = pung/run of a number. Keep number-only.
  void dragon;
  return run.progress > pung.progress && run.feasible ? run : pung;
}

/** Evaluate one unfilled requirement. */
function evalRequirement(req: TargetRequirement, ctx: Ctx): ReqEval {
  switch (req.kind) {
    case "any-pair":
      return bestNumberSet(ctx, 2);
    case "number-pung":
      return bestNumberSet(ctx, 3);
    case "number-kong":
      return ctx.kongsEnabled
        ? bestNumberSet(ctx, 4)
        : { feasible: false, need: new Map(), progress: 0, reason: "Kongs are not unlocked yet" };
    case "number-quint":
      return ctx.kongsEnabled
        ? bestNumberSet(ctx, 5)
        : { feasible: false, need: new Map(), progress: 0, reason: "Quints are not unlocked yet" };
    case "suited-run":
      return bestRun(ctx);
    case "suit-run":
      return bestRun(ctx, req.suit);
    case "dragon-set":
      return bestDragonSet(ctx);
    case "suit-set": {
      const pung = req.suit
        ? bestNumberSetForSuit(ctx, req.suit, 3)
        : bestNumberSet(ctx, 3);
      const run = bestRun(ctx, req.suit);
      return run.progress > pung.progress && run.feasible ? run : pung;
    }
    case "any-set":
      return bestAnySet(ctx);
    default:
      return { feasible: true, need: new Map(), progress: 0 };
  }
}

/** Same-tile pung/kong restricted to one suit (for suit-set). */
function bestNumberSetForSuit(ctx: Ctx, suit: Suit, count: number): ReqEval {
  let best: ReqEval | null = null;
  for (const r of [1, 2, 3] as Rank[]) {
    const type = `${suit}-${r}` as TileTypeId;
    if (!ok(ctx, type)) continue;
    const held = ctx.numberHeld.get(type) ?? 0;
    const missing = Math.max(0, count - held);
    const need = new Map<TileTypeId, number>();
    if (missing > 0) need.set(type, missing);
    const cand: ReqEval = { feasible: true, need, progress: Math.min(1, held / count) };
    if (!best || cand.progress > best.progress) best = cand;
  }
  return best ?? { feasible: false, need: new Map(), progress: 0, reason: `No ${suit} tiles available` };
}

function emptyCellCount(board: Board): number {
  let n = 0;
  for (const c of board) if (!c) n++;
  return n;
}

/**
 * Verify a target hand is still achievable from the current game state and the
 * tiles that can still arrive. Pure and deterministic.
 */
export function evaluateHandSolvability(
  gameState: GameState,
  targetHand: TargetHand,
  futureBag: TileDefinition[],
): SolvabilityResult {
  const board = gameState.board;
  const ctx = buildCtx(board, futureBag, gameState);

  const unfilled = targetHand.requirements.filter((r) => !r.filledBy);
  const missingRequirements: string[] = [];
  const blockingReasons: string[] = [];
  const requiredTileCounts: Record<string, number> = {};

  let progressSum = 0;
  for (const req of unfilled) {
    const e = evalRequirement(req, ctx);
    progressSum += e.progress;
    if (!e.feasible) {
      missingRequirements.push(req.label);
      if (e.reason) blockingReasons.push(`${req.label}: ${e.reason}`);
    }
    // Aggregate the max need per type (requirements don't literally share
    // supply — the generator can produce each — so take the max, not the sum).
    for (const [type, n] of e.need) {
      requiredTileCounts[type] = Math.max(requiredTileCounts[type] ?? 0, n);
    }
  }

  // Terminal dead-end: board full, no legal move, hand not complete.
  const empty = emptyCellCount(board);
  const deadlocked =
    empty === 0 && !hasAnyMove(board, ruleOptsFor(gameState)) && unfilled.length > 0;
  if (deadlocked) blockingReasons.push("Board is full with no legal move");

  const solvable = missingRequirements.length === 0 && !deadlocked;

  // Confidence: average concrete progress, discounted by board congestion and
  // by how much still-needed supply the near-term bag actually covers.
  let confidence = unfilled.length === 0 ? 1 : progressSum / unfilled.length;
  const totalNeed = Object.values(requiredTileCounts).reduce((a, b) => a + b, 0);
  const roomRatio = Math.min(1, empty / Math.max(1, totalNeed));
  confidence *= 0.5 + 0.5 * roomRatio; // congestion penalty
  if (empty <= 2 && totalNeed > empty) confidence *= 0.6;
  if (!solvable) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  return { solvable, confidence, missingRequirements, requiredTileCounts, blockingReasons };
}

/**
 * The single most valuable tile type to spawn right now to keep the target on
 * track: the still-needed type the board is most starved of. Returns null when
 * nothing is urgently needed. Used by the generator to steer the fair bag so a
 * required tile never starves. Deterministic.
 */
export function steerTypeForTarget(
  gameState: GameState,
  targetHand: TargetHand,
): TileTypeId | null {
  // Look only at what is on the board (no future bag) so steering reacts to the
  // live shortage, then bias a spawn toward filling it.
  const ctx = buildCtx(gameState.board, [], gameState);
  const unfilled = targetHand.requirements.filter((r) => !r.filledBy);

  let bestType: TileTypeId | null = null;
  let bestScore = 0;
  for (const req of unfilled) {
    const e = evalRequirement(req, ctx);
    if (!e.feasible) continue;
    for (const [type, n] of e.need) {
      // Prefer the requirement closest to done (highest progress) and the tile
      // it most needs — that is where one good spawn does the most good.
      const score = e.progress * 10 + n;
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
  }
  return bestType;
}
