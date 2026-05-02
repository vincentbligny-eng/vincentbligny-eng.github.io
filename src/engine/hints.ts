import { LETTER_VALUE, PREMIUM_GRID, type Premium, RACK_SIZE } from './constants';
import { findMoves } from './moves';
import type { Board, Direction, Move } from './types';
import type { Dictionary } from './dictionary';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

export interface RackAnalysis {
  letters: string[];
  value: number;
  vowels: number;
  consonants: number;
  blanks: number;
  heavy: string[];          // letters worth ≥ 4
  duplicates: string[];     // letters appearing > 1 time
  balanced: boolean;        // rough: 2-4 vowels is balanced
  anagrams: string[];       // valid words using ALL rack letters (top 8)
}

export interface HookHint {
  word: string;
  tile: string;        // the single letter placed
  dir: Direction;
  row: number;
  col: number;
  score: number;
}

export interface HintReport {
  moveCount: number;
  bingoCount: number;
  topMove: Move | null;
  topN: Move[];
  premiumsInTop: Premium[];
  hooks: HookHint[];
  rack: RackAnalysis;
  coach: string;              // one-line strategic nudge
  // Progressive teasers derived from topMove (cheap to precompute):
  teaser: {
    length: number;
    dir: Direction;
    firstLetter: string;
    lastLetter: string;
    row: number;
    col: number;
    usesBlank: boolean;
    score: number;
    bingo: boolean;
  } | null;
}

export function analyzeRack(rack: string[], dict: Dictionary): RackAnalysis {
  const letters = [...rack];
  const blanks = letters.filter(c => c === '?').length;
  const real = letters.filter(c => c !== '?');
  const value = real.reduce((s, c) => s + (LETTER_VALUE[c] ?? 0), 0);
  const vowels = real.filter(c => VOWELS.has(c)).length;
  const consonants = real.length - vowels;
  const heavy = real.filter(c => (LETTER_VALUE[c] ?? 0) >= 4);
  const counts: Record<string, number> = {};
  for (const c of real) counts[c] = (counts[c] ?? 0) + 1;
  const duplicates = Object.keys(counts).filter(c => counts[c] > 1);
  const balanced = vowels + blanks >= 2 && consonants + blanks >= 2;
  const anagrams = findAnagrams(letters, dict);
  return { letters, value, vowels, consonants, blanks, heavy, duplicates, balanced, anagrams };
}

function findAnagrams(rack: string[], dict: Dictionary): string[] {
  const len = rack.length;
  if (len < 2 || len > 15) return [];
  const counts: Record<string, number> = {};
  let blanks = 0;
  for (const c of rack) {
    if (c === '?') blanks++;
    else counts[c] = (counts[c] ?? 0) + 1;
  }
  const out: string[] = [];
  for (const word of dict.byLength(len)) {
    const local = { ...counts };
    let blanksLeft = blanks;
    let ok = true;
    for (const c of word) {
      if ((local[c] ?? 0) > 0) local[c]--;
      else if (blanksLeft > 0) blanksLeft--;
      else { ok = false; break; }
    }
    if (ok) {
      out.push(word);
      if (out.length >= 8) break;
    }
  }
  return out;
}

export function computeHints(board: Board, rack: string[], dict: Dictionary): HintReport {
  // Cap at 300 to keep heavy boards responsive; top-move + bingo detection are preserved
  // because high-value moves dominate the sort.
  const allMoves = findMoves(board, dict, { rack, topN: 300 });
  const topMove = allMoves[0] ?? null;
  const bingoCount = allMoves.filter(m => m.bingo).length;

  const premiumsInTop: Premium[] = [];
  if (topMove) {
    for (const p of topMove.placements) {
      const prem = PREMIUM_GRID[p.row][p.col];
      if (prem) premiumsInTop.push(prem);
    }
  }

  const hooks: HookHint[] = allMoves
    .filter(m => m.placements.length === 1)
    .slice(0, 5)
    .map(m => ({
      word: m.word,
      tile: m.placements[0].letter,
      dir: m.dir,
      row: m.row,
      col: m.col,
      score: m.score,
    }));

  const rackAnalysis = analyzeRack(rack, dict);
  const coach = buildCoachLine(rackAnalysis, allMoves, topMove, bingoCount);

  const teaser = topMove ? {
    length: topMove.word.length,
    dir: topMove.dir,
    firstLetter: topMove.word[0],
    lastLetter: topMove.word[topMove.word.length - 1],
    row: topMove.row,
    col: topMove.col,
    usesBlank: topMove.placements.some(p => p.blank),
    score: topMove.score,
    bingo: topMove.bingo,
  } : null;

  return {
    moveCount: allMoves.length,
    bingoCount,
    topMove,
    topN: allMoves.slice(0, 3),
    premiumsInTop,
    hooks,
    rack: rackAnalysis,
    coach,
    teaser,
  };
}

function buildCoachLine(
  rack: RackAnalysis, moves: Move[], top: Move | null, bingos: number,
): string {
  if (!top) {
    return rack.vowels === 0
      ? 'Aucune voyelle : passer peut être la meilleure option.'
      : rack.consonants === 0
      ? 'Rack trop vocalique — envisagez un échange.'
      : 'Aucun coup légal trouvé — vous pouvez passer.';
  }
  if (bingos > 0) {
    return `🚀 Un scrabble est disponible (${bingos > 1 ? `${bingos} trouvés` : '1 trouvé'}, meilleur = ${top.bingo ? top.score : '?'} pts).`;
  }
  const premCount = top.placements
    .map(p => PREMIUM_GRID[p.row][p.col])
    .filter(Boolean).length;
  if (premCount >= 2) {
    return `Une double zone premium est exploitable (${top.score} pts au meilleur).`;
  }
  if (rack.anagrams.length > 0 && rack.letters.length >= 5) {
    return `Votre rack entier forme ${rack.anagrams.length} mot${rack.anagrams.length > 1 ? 's' : ''}, mais la pose à ${top.score} pts est souvent meilleure que l'attente.`;
  }
  if (!rack.balanced) {
    return rack.consonants < rack.vowels
      ? 'Tirage vocalique — une pose légère pour rééquilibrer peut payer.'
      : 'Tirage riche en consonnes — sortez-en quelques-unes.';
  }
  if (rack.heavy.length >= 2) {
    return `Plusieurs grosses lettres (${rack.heavy.join(', ')}) — visez une case premium.`;
  }
  return `${moves.length} coup${moves.length > 1 ? 's' : ''} possible${moves.length > 1 ? 's' : ''}, meilleur à ${top.score} pts.`;
}
