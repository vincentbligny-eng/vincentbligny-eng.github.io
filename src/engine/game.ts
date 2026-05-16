import { createEmptyBoard, applyMove } from './board';
import { createBag, refill, shuffle } from './bag';
import { rng } from './rng';
import type { GameState, Move, Placement, RackTile, TurnRecord } from './types';
import { findMoves, validatePlayerMove } from './moves';
import type { Dictionary } from './dictionary';

function mkTile(letter: string, salt: number): RackTile {
  return { letter, id: `${letter}-${salt}-${Math.random().toString(36).slice(2, 7)}` };
}

export function newGame(seed = Date.now() & 0xffff): GameState {
  const r = rng(seed);
  const initialBag = shuffle(createBag(), r);
  const { rack, bag } = refill([], initialBag, r);
  return {
    board: createEmptyBoard(),
    rack: rack.map((l, i) => mkTile(l, i)),
    bag,
    reserved: [],
    turn: 1,
    totalScore: 0,
    topScore: 0,
    history: [],
    seed,
    overridden: false,
  };
}

export interface SubmitOptions {
  dict: Dictionary;
  placements: Placement[] | null; // null = pass
}

export interface SubmitResult {
  state: GameState;
  playerMove: Move | null;
  topMove: Move | null;
  playerError?: string;
}

export function submit(state: GameState, opts: SubmitOptions): SubmitResult {
  const top = findMoves(state.board, opts.dict, {
    rack: state.rack.map(t => t.letter),
    topN: 1,
  })[0] ?? null;

  let playerMove: Move | null = null;
  let playerError: string | undefined;
  if (opts.placements && opts.placements.length > 0) {
    const res = validatePlayerMove(state.board, opts.placements, opts.dict);
    if ('error' in res) playerError = res.error;
    else playerMove = res.move;
  }

  // Duplicate mode: the TOP is always applied to the board. Player's score is
  // whatever their submitted word would have scored (0 on pass / invalid).
  const playerScore = playerMove?.score ?? 0;
  const topScore = top?.score ?? 0;

  const nextBoard = top ? applyMove(state.board, top, state.turn) : state.board;

  // Remove the top's used tiles from the rack, then refill.
  const rackLetters = state.rack.map(t => t.letter);
  if (top) {
    for (const p of top.placements) {
      // A blank tile is always removed as '?' from the rack.
      const needed = p.blank ? '?' : p.letter;
      const idx = rackLetters.indexOf(needed);
      if (idx !== -1) rackLetters.splice(idx, 1);
    }
  }

  const r = rng(state.seed ^ state.turn);
  const { rack: nextLetters, bag: nextBag } = refill(rackLetters, state.bag, r, state.reserved);

  const nextRack = nextLetters.map((l, i) => mkTile(l, state.turn * 10 + i));

  const record: TurnRecord = {
    turn: state.turn,
    rackBefore: state.rack.map(t => t.letter),
    playerMove,
    topMove: top,
    playerScore,
    topScore,
  };

  return {
    state: {
      ...state,
      board: nextBoard,
      rack: nextRack,
      bag: nextBag,
      reserved: [],
      turn: state.turn + 1,
      totalScore: state.totalScore + playerScore,
      topScore: state.topScore + topScore,
      history: [...state.history, record],
      overridden: !!playerMove && top ? playerMove.word !== top.word : false,
    },
    playerMove,
    topMove: top,
    playerError,
  };
}

export function topHints(state: GameState, dict: Dictionary, n = 3): Move[] {
  return findMoves(state.board, dict, { rack: state.rack.map(t => t.letter), topN: n });
}

export function remainingByLetter(state: GameState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of state.bag) counts[l] = (counts[l] ?? 0) + 1;
  return counts;
}

// ─── Duel mode ────────────────────────────────────────────────────────────

export interface DuelSubmission {
  playerId: string;
  playerName: string;
  placements: Placement[] | null; // null = pass
  submittedAt?: number;           // tiebreak when two humans hit the same top score
  usedHints?: boolean;            // player consulted the Aide progressive this turn
  appliedHint?: boolean;          // player applied a hint directly to their pending move
  decayMultiplier?: number;       // 0..1 — late-penalty factor applied to this submission's score
}

export interface DuelOutcome {
  playerId: string;
  playerName: string;
  move: Move | null;
  score: number;          // final (decayed) score credited to the player
  rawScore: number;       // score before late-penalty decay
  decayMultiplier: number; // 0..1 — late-penalty factor applied (1 if no decay)
  diff: number;           // score − topScore (always ≤ 0); this is the tournament écart
  error?: string;
  usedHints?: boolean;    // peeked at the suggestions
  appliedHint?: boolean;  // applied one directly
}

export interface DuelResolution {
  outcomes: DuelOutcome[];
  topMove: Move | null;      // what got played on the board (Ordi's top, or a human's if they beat it)
  topScore: number;          // topMove.score (0 if no legal move)
  ordiMove: Move | null;     // Ordi's pre-override discovery — same as topMove unless humanOverride is set
  ordiScore: number;
  humanOverride: { playerId: string; playerName: string } | null; // sorry-sorry: a human topped Ordi
  state: GameState;
}

// Resolve a duel turn with tournament deficit scoring + sorry-sorry override:
//   - Engine picks Ordi's top move.
//   - Each human's submission is validated. If the highest human score beats
//     Ordi's, that move replaces Ordi's on the board ("sorry-sorry") and
//     becomes the new reference for everyone's écart.
//   - Each human's `diff = score − effectiveTopScore` (always ≤ 0).
//   - Rack consumes whatever move was actually played, then refills.
export function resolveDuel(state: GameState, subs: DuelSubmission[], dict: Dictionary): DuelResolution {
  const ordiMove = findMoves(state.board, dict, {
    rack: state.rack.map(t => t.letter), topN: 1,
  })[0] ?? null;
  const ordiScore = ordiMove?.score ?? 0;

  // Validate each submission once, attach the validated move to the outcome.
  type WipOutcome = DuelOutcome & { sub: DuelSubmission };
  const wip: WipOutcome[] = subs.map(s => {
    const meta = { usedHints: !!s.usedHints, appliedHint: !!s.appliedHint };
    const mult = s.decayMultiplier == null ? 1 : Math.max(0, Math.min(1, s.decayMultiplier));
    if (!s.placements || s.placements.length === 0) {
      return { sub: s, playerId: s.playerId, playerName: s.playerName, move: null,
               score: 0, rawScore: 0, decayMultiplier: mult, diff: 0, ...meta };
    }
    const v = validatePlayerMove(state.board, s.placements, dict);
    if ('error' in v) {
      return { sub: s, playerId: s.playerId, playerName: s.playerName, move: null,
               score: 0, rawScore: 0, decayMultiplier: mult, diff: 0, error: v.error, ...meta };
    }
    const raw = v.move.score;
    const decayed = Math.round(raw * mult);
    return { sub: s, playerId: s.playerId, playerName: s.playerName, move: v.move,
             score: decayed, rawScore: raw, decayMultiplier: mult, diff: 0, ...meta };
  });

  // Pick the best human (max score; tiebreak on earliest submittedAt). The
  // sorry-sorry comparison uses the decayed score — a slow player should not
  // get to replace Ordi's move with a stale top, but their raw move still
  // appears in history.
  const humanCandidate = wip
    .filter(o => o.move != null && o.score > 0)
    .sort((a, b) => b.score - a.score
      || (a.sub.submittedAt ?? Infinity) - (b.sub.submittedAt ?? Infinity))[0];

  const override = humanCandidate && humanCandidate.score > ordiScore ? humanCandidate : null;
  const topMove = override?.move ?? ordiMove;
  const topScore = override?.score ?? ordiScore;
  const humanOverride = override
    ? { playerId: override.playerId, playerName: override.playerName }
    : null;

  // Stamp final diffs against the effective top.
  const outcomes: DuelOutcome[] = wip.map(({ sub, ...o }) => ({ ...o, diff: o.score - topScore }));

  const nextBoard = topMove ? applyMove(state.board, topMove, state.turn) : state.board;

  const rackLetters = state.rack.map(t => t.letter);
  if (topMove) {
    for (const p of topMove.placements) {
      const needed = p.blank ? '?' : p.letter;
      const idx = rackLetters.indexOf(needed);
      if (idx !== -1) rackLetters.splice(idx, 1);
    }
  }
  const r = rng((state.seed ?? Date.now()) ^ state.turn);
  const { rack: nextLetters, bag: nextBag } = refill(rackLetters, state.bag, r, state.reserved);
  const nextRack = nextLetters.map((l, i) => mkTile(l, state.turn * 10 + i));

  return {
    outcomes,
    topMove,
    topScore,
    ordiMove,
    ordiScore,
    humanOverride,
    state: {
      ...state,
      board: nextBoard,
      rack: nextRack,
      bag: nextBag,
      reserved: [],
      turn: state.turn + 1,
      totalScore: state.totalScore + topScore,
      topScore: state.topScore + topScore,
      overridden: !!humanOverride,
    },
  };
}
