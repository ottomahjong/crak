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
// completed from where the game is now, given the FINITE wall still to be drawn?
// It runs (a) before a target is presented — a hand that cannot be built from
// the board plus the remaining wall is never dealt — and (b) before every spawn
// — if a required tile is scarce, the draw is steered to supply it while the
// wall still can.
//
// Supply is now genuinely finite, so the check accounts for it exactly: a tile
// is "reachable" only if enough copies sit on the board or remain in the wall
// (the futureBag). A requirement whose tiles are exhausted is infeasible — this
// is the finite wall's fairness endgame, and how the game knows it is lost.

const NUMBER_TYPES: TileTypeId[] = [
  "dot-1", "dot-2", "dot-3",
  "bam-1", "bam-2", "bam-3",
  "crak-1", "crak-2", "crak-3",
];

const SAME_TILE_COUNT: Record<string, number> = { pair: 2, pung: 3, kong: 4, quint: 5 };

type Counts = {
  num: Map<TileTypeId, number>;
  dragon: Map<DragonColor, number>;
  suitRanks: Map<Suit, Set<Rank>>;
  jokers: number;
};

type Ctx = {
  board: Counts; // tiles physically on the board (loose + locked in sets)
  reach: Counts; // board + futureBag — everything still obtainable
  allowed?: ReadonlySet<TileTypeId>;
  kongsEnabled: boolean;
};

function emptyCounts(): Counts {
  const suitRanks = new Map<Suit, Set<Rank>>();
  for (const s of SUITS) suitRanks.set(s, new Set());
  return { num: new Map(), dragon: new Map(), suitRanks, jokers: 0 };
}

function addNumber(c: Counts, suit: Suit, rank: Rank, n: number) {
  const key = `${suit}-${rank}` as TileTypeId;
  c.num.set(key, (c.num.get(key) ?? 0) + n);
  c.suitRanks.get(suit)!.add(rank);
}

/** Copies a completed same-tile set contributes toward its identity. */
function setContribution(setKind?: string): number {
  return SAME_TILE_COUNT[setKind ?? ""] ?? 0;
}

function tallyBoard(board: Board, c: Counts) {
  for (const t of board) {
    if (!t) continue;
    if (t.state === "loose") {
      if (t.isJoker) c.jokers++;
      else if (t.dragon) c.dragon.set(t.dragon, (c.dragon.get(t.dragon) ?? 0) + 1);
      else if (t.suit && t.rank) addNumber(c, t.suit, t.rank, 1);
      continue;
    }
    const n = setContribution(t.setKind);
    if (t.setKind === "partial" && t.suit && t.partRanks) {
      for (const r of t.partRanks) addNumber(c, t.suit, r, 1);
    } else if (t.setKind === "run" && t.suit) {
      for (const r of [1, 2, 3] as Rank[]) addNumber(c, t.suit, r, 1);
    } else if (t.suit && t.rank) {
      addNumber(c, t.suit, t.rank, n);
    } else if (t.dragon) {
      c.dragon.set(t.dragon, (c.dragon.get(t.dragon) ?? 0) + n);
    }
  }
}

function tallyBag(bag: TileDefinition[], c: Counts) {
  for (const type of bag) {
    if (type === "joker") c.jokers++;
    else if (type.startsWith("dragon-")) {
      const d = type.split("-")[1] as DragonColor;
      c.dragon.set(d, (c.dragon.get(d) ?? 0) + 1);
    } else {
      const [suit, rankStr] = type.split("-");
      addNumber(c, suit as Suit, Number(rankStr) as Rank, 1);
    }
  }
}

function buildCtx(board: Board, futureBag: TileDefinition[], gs: GameState): Ctx {
  const boardC = emptyCounts();
  tallyBoard(board, boardC);
  // reach = board + future.
  const reach = emptyCounts();
  tallyBoard(board, reach);
  tallyBag(futureBag, reach);
  return {
    board: boardC,
    reach,
    allowed: learningPool(gs.learning),
    kongsEnabled: ruleOptsFor(gs).kongs === true,
  };
}

function ok(ctx: Ctx, t: TileTypeId): boolean {
  return !ctx.allowed || ctx.allowed.has(t);
}

type ReqEval = {
  feasible: boolean;
  /** Tiles still to be DRAWN (not yet on the board) for the cheapest recipe. */
  need: Map<TileTypeId, number>;
  /** Concrete progress 0..1 from what is already on the board. */
  progress: number;
  reason?: string;
};

const infeasible = (reason: string): ReqEval => ({
  feasible: false,
  need: new Map(),
  progress: 0,
  reason,
});

/** A same-tile set (pair/pung/kong/quint) of a NUMBER, optionally one suit. */
function numberSameTile(ctx: Ctx, count: number, suit?: Suit): ReqEval {
  const types = (suit ? [1, 2, 3].map((r) => `${suit}-${r}`) : NUMBER_TYPES) as TileTypeId[];
  let best: ReqEval | null = null;
  let anyAllowed = false;
  for (const type of types) {
    if (!ok(ctx, type)) continue;
    anyAllowed = true;
    const reach = ctx.reach.num.get(type) ?? 0;
    const realMin = Math.min(2, count); // a set needs at least this many real copies
    // Feasible if enough real copies are reachable and jokers can cover the rest.
    const feasible = reach >= realMin && reach + ctx.reach.jokers >= count;
    if (!feasible) continue;
    const held = ctx.board.num.get(type) ?? 0;
    const need = new Map<TileTypeId, number>();
    const missing = Math.max(0, count - held);
    if (missing > 0) need.set(type, missing);
    const cand: ReqEval = { feasible: true, need, progress: Math.min(1, held / count) };
    if (!best || cand.progress > best.progress) best = cand;
  }
  if (best) return best;
  return infeasible(anyAllowed ? "not enough copies remain" : "tile family unavailable");
}

/** A run (1·2·3) in some suit, optionally a specific suit. */
function run(ctx: Ctx, suit?: Suit): ReqEval {
  const suits = suit ? [suit] : SUITS;
  let best: ReqEval | null = null;
  let anyAllowed = false;
  for (const s of suits) {
    const ranks = [1, 2, 3] as Rank[];
    if (!ranks.some((r) => ok(ctx, `${s}-${r}` as TileTypeId))) continue;
    anyAllowed = true;
    const reachRanks = ctx.reach.suitRanks.get(s) ?? new Set<Rank>();
    const missingReach = ranks.filter((r) => !reachRanks.has(r));
    // A run needs 2 real adjacent ranks + the third (real or one joker). So at
    // most one rank may be missing from the reachable supply, and only if a
    // joker can stand in for it.
    const feasible = missingReach.length === 0 || (missingReach.length === 1 && ctx.reach.jokers >= 1);
    if (!feasible) continue;
    const boardRanks = ctx.board.suitRanks.get(s) ?? new Set<Rank>();
    const missingBoard = ranks.filter((r) => !boardRanks.has(r));
    const need = new Map<TileTypeId, number>();
    for (const r of missingBoard) need.set(`${s}-${r}` as TileTypeId, 1);
    const cand: ReqEval = { feasible: true, need, progress: (3 - missingBoard.length) / 3 };
    if (!best || cand.progress > best.progress) best = cand;
  }
  if (best) return best;
  return infeasible(anyAllowed ? "run cannot be completed" : `no ${suit ?? ""} tiles`);
}

/** A dragon set (a pair suffices) in some colour. */
function dragonSet(ctx: Ctx): ReqEval {
  const colors = DRAGONS.filter((c) => ok(ctx, `dragon-${c}` as TileTypeId));
  if (colors.length === 0) return infeasible("no dragon tiles");
  let best: ReqEval | null = null;
  for (const c of colors) {
    const reach = ctx.reach.dragon.get(c) ?? 0;
    if (reach < 2) continue; // a pair needs two real dragons; jokers can't start it
    const held = ctx.board.dragon.get(c) ?? 0;
    const need = new Map<TileTypeId, number>();
    const missing = Math.max(0, 2 - held);
    if (missing > 0) need.set(`dragon-${c}` as TileTypeId, missing);
    const cand: ReqEval = { feasible: true, need, progress: Math.min(1, held / 2) };
    if (!best || cand.progress > best.progress) best = cand;
  }
  return best ?? infeasible("not enough dragons remain");
}

function anySet(ctx: Ctx): ReqEval {
  const pung = numberSameTile(ctx, 3);
  const r = run(ctx);
  if (pung.feasible && r.feasible) return r.progress > pung.progress ? r : pung;
  return pung.feasible ? pung : r;
}

function evalRequirement(req: TargetRequirement, ctx: Ctx): ReqEval {
  switch (req.kind) {
    case "any-pair":
      return numberSameTile(ctx, 2);
    case "number-pung":
      return numberSameTile(ctx, 3);
    case "number-kong":
      return ctx.kongsEnabled ? numberSameTile(ctx, 4) : infeasible("Kongs are not unlocked yet");
    case "number-quint":
      return ctx.kongsEnabled ? numberSameTile(ctx, 5) : infeasible("Quints are not unlocked yet");
    case "suited-run":
      return run(ctx);
    case "suit-run":
      return run(ctx, req.suit);
    case "dragon-set":
      return dragonSet(ctx);
    case "suit-set": {
      const pung = numberSameTile(ctx, 3, req.suit);
      const r = run(ctx, req.suit);
      if (pung.feasible && r.feasible) return r.progress > pung.progress ? r : pung;
      return pung.feasible ? pung : r;
    }
    case "any-set":
      return anySet(ctx);
    default:
      return { feasible: true, need: new Map(), progress: 0 };
  }
}

// ---------------------------------------------------------------------------
// Shared-supply feasibility: can EVERY unfilled requirement be satisfied at
// once from the finite pool? With a finite wall the requirements compete for
// the same tiles, so independent per-requirement checks aren't enough — we need
// a disjoint assignment. Sizes are tiny (≤4 requirements), so a bounded
// backtracking search over concrete recipes is exact and fast.
// ---------------------------------------------------------------------------

type Recipe = { tiles: Array<[TileTypeId, number]>; jokers: number };

/** Same-tile set recipes (real copies, optionally jokers for the surplus). */
function sameTileRecipes(types: TileTypeId[], count: number): Recipe[] {
  const out: Recipe[] = [];
  for (const t of types) {
    for (let j = 0; j <= count - 2; j++) out.push({ tiles: [[t, count - j]], jokers: j });
  }
  return out;
}

/** Run recipes for a suit: three reals, or two adjacent reals + one joker. */
function runRecipesForSuit(s: Suit): Recipe[] {
  const r = (n: number) => `${s}-${n}` as TileTypeId;
  return [
    { tiles: [[r(1), 1], [r(2), 1], [r(3), 1]], jokers: 0 },
    { tiles: [[r(1), 1], [r(2), 1]], jokers: 1 },
    { tiles: [[r(2), 1], [r(3), 1]], jokers: 1 },
  ];
}

function recipesFor(req: TargetRequirement, ctx: Ctx): Recipe[] {
  const nums = NUMBER_TYPES.filter((t) => ok(ctx, t));
  const suitNums = (s: Suit) => ([1, 2, 3].map((n) => `${s}-${n}`) as TileTypeId[]).filter((t) => ok(ctx, t));
  const runs = (s?: Suit) => (s ? [s] : SUITS).filter((x) => ok(ctx, `${x}-1` as TileTypeId)).flatMap(runRecipesForSuit);
  const dragons = DRAGONS.filter((d) => ok(ctx, `dragon-${d}` as TileTypeId)).map(
    (d): Recipe => ({ tiles: [[`dragon-${d}` as TileTypeId, 2]], jokers: 0 }),
  );
  switch (req.kind) {
    case "any-pair":
      return sameTileRecipes(nums, 2);
    case "number-pung":
      return sameTileRecipes(nums, 3);
    case "number-kong":
      return ctx.kongsEnabled ? sameTileRecipes(nums, 4) : [];
    case "number-quint":
      return ctx.kongsEnabled ? sameTileRecipes(nums, 5) : [];
    case "suited-run":
      return runs();
    case "suit-run":
      return req.suit ? runs(req.suit) : runs();
    case "dragon-set":
      return dragons;
    case "suit-set":
      return req.suit ? [...sameTileRecipes(suitNums(req.suit), 3), ...runs(req.suit)] : sameTileRecipes(nums, 3);
    case "any-set":
      return [...sameTileRecipes(nums, 3), ...runs()];
    default:
      return [{ tiles: [], jokers: 0 }];
  }
}

/** The finite pool of real tiles + jokers still obtainable (board + wall). */
function poolFromReach(ctx: Ctx): { tiles: Map<TileTypeId, number>; jokers: number } {
  const tiles = new Map<TileTypeId, number>(ctx.reach.num);
  for (const [color, n] of ctx.reach.dragon) tiles.set(`dragon-${color}` as TileTypeId, n);
  return { tiles, jokers: ctx.reach.jokers };
}

/** Can all requirements be satisfied at once from the shared finite pool? */
function canAssignAll(reqs: TargetRequirement[], ctx: Ctx): boolean {
  const pool = poolFromReach(ctx);
  const options = reqs
    .map((r) => recipesFor(r, ctx))
    .sort((a, b) => a.length - b.length); // most-constrained first

  const fits = (rec: Recipe) =>
    pool.jokers >= rec.jokers && rec.tiles.every(([t, n]) => (pool.tiles.get(t) ?? 0) >= n);
  const apply = (rec: Recipe, sign: 1 | -1) => {
    pool.jokers -= sign * rec.jokers;
    for (const [t, n] of rec.tiles) pool.tiles.set(t, (pool.tiles.get(t) ?? 0) - sign * n);
  };

  const solve = (i: number): boolean => {
    if (i === options.length) return true;
    for (const rec of options[i]) {
      if (!fits(rec)) continue;
      apply(rec, 1);
      if (solve(i + 1)) return true;
      apply(rec, -1);
    }
    return false;
  };
  return solve(0);
}

function emptyCellCount(board: Board): number {
  let n = 0;
  for (const c of board) if (!c) n++;
  return n;
}

/**
 * Verify a target hand is still achievable from the current game state and the
 * tiles remaining in the wall (futureBag). Pure and deterministic.
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
    for (const [type, n] of e.need) {
      requiredTileCounts[type] = Math.max(requiredTileCounts[type] ?? 0, n);
    }
  }

  // Shared-supply check: even when each requirement is individually reachable,
  // the finite pool must satisfy them all at once (they compete for tiles).
  let sharedSupplyOk = true;
  if (missingRequirements.length === 0 && unfilled.length > 0) {
    sharedSupplyOk = canAssignAll(unfilled, ctx);
    if (!sharedSupplyOk) blockingReasons.push("Not enough tiles remain to complete every set");
  }

  const empty = emptyCellCount(board);
  const deadlocked =
    empty === 0 && !hasAnyMove(board, ruleOptsFor(gameState)) && unfilled.length > 0;
  if (deadlocked) blockingReasons.push("Board is full with no legal move");

  const solvable = missingRequirements.length === 0 && sharedSupplyOk && !deadlocked;

  let confidence = unfilled.length === 0 ? 1 : progressSum / unfilled.length;
  const totalNeed = Object.values(requiredTileCounts).reduce((a, b) => a + b, 0);
  const roomRatio = Math.min(1, empty / Math.max(1, totalNeed));
  confidence *= 0.5 + 0.5 * roomRatio;
  if (empty <= 2 && totalNeed > empty) confidence *= 0.6;
  if (!solvable) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  return { solvable, confidence, missingRequirements, requiredTileCounts, blockingReasons };
}

/**
 * The single most valuable tile type to spawn now to keep the target on track:
 * the still-needed type the board is most starved of, among tiles still in the
 * wall. Returns null when nothing is urgently needed. Deterministic.
 */
export function steerTypeForTarget(
  gameState: GameState,
  targetHand: TargetHand,
): TileTypeId | null {
  // Feasibility judged against the remaining wall; "need" stays board-relative.
  const ctx = buildCtx(gameState.board, gameState.wall, gameState);
  const unfilled = targetHand.requirements.filter((r) => !r.filledBy);

  let bestType: TileTypeId | null = null;
  let bestScore = 0;
  for (const req of unfilled) {
    const e = evalRequirement(req, ctx);
    if (!e.feasible) continue;
    for (const [type, n] of e.need) {
      const score = e.progress * 10 + n;
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
  }
  return bestType;
}
