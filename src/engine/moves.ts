import { BOARD_SIZE, LETTER_VALUE, PREMIUM_GRID, RACK_SIZE, BINGO_BONUS } from './constants';
import { inBounds, isBoardEmpty } from './board';
import type { Board, Direction, Move, Placement } from './types';
import type { Dictionary } from './dictionary';

const CENTER = Math.floor(BOARD_SIZE / 2);

type Rack = { letters: Record<string, number>; blanks: number; size: number };

function toRack(tiles: string[]): Rack {
  const letters: Record<string, number> = {};
  let blanks = 0;
  for (const t of tiles) {
    if (t === '?') blanks++;
    else letters[t] = (letters[t] ?? 0) + 1;
  }
  return { letters, blanks, size: tiles.length };
}

function anchors(board: Board): Array<[number, number]> {
  if (isBoardEmpty(board)) return [[CENTER, CENTER]];
  const out: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].letter) continue;
      if (
        (inBounds(r - 1, c) && board[r - 1][c].letter) ||
        (inBounds(r + 1, c) && board[r + 1][c].letter) ||
        (inBounds(r, c - 1) && board[r][c - 1].letter) ||
        (inBounds(r, c + 1) && board[r][c + 1].letter)
      ) out.push([r, c]);
    }
  }
  return out;
}

function slotPattern(
  board: Board, row: number, col: number, dir: Direction, len: number,
): { existing: (string | null)[]; blanks: number } | null {
  const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;

  const pr = row - dr, pc = col - dc;
  if (inBounds(pr, pc) && board[pr][pc].letter) return null;
  const ar = row + len * dr, ac = col + len * dc;
  if (inBounds(ar, ac) && board[ar][ac].letter) return null;

  const existing: (string | null)[] = new Array(len);
  let blanks = 0;
  for (let i = 0; i < len; i++) {
    const r = row + i * dr, c = col + i * dc;
    if (!inBounds(r, c)) return null;
    const cell = board[r][c];
    if (cell.letter) existing[i] = cell.letter;
    else { existing[i] = null; blanks++; }
  }
  if (blanks === 0) return null;
  return { existing, blanks };
}

function buildPlacements(
  row: number, col: number, dir: Direction, word: string,
  existing: (string | null)[], rack: Rack,
): Placement[] | null {
  const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
  const used: Record<string, number> = {};
  let blanksLeft = rack.blanks;
  const placements: Placement[] = [];

  for (let i = 0; i < word.length; i++) {
    const onBoard = existing[i];
    const target = word[i];
    if (onBoard) {
      if (onBoard !== target) return null;
      continue;
    }
    const have = rack.letters[target] ?? 0;
    const consumed = used[target] ?? 0;
    if (consumed < have) {
      used[target] = consumed + 1;
      placements.push({ row: row + i * dr, col: col + i * dc, letter: target, blank: false });
    } else if (blanksLeft > 0) {
      blanksLeft--;
      placements.push({ row: row + i * dr, col: col + i * dc, letter: target, blank: true });
    } else {
      return null;
    }
  }
  return placements;
}

function scorePlacement(
  board: Board, row: number, col: number, dir: Direction,
  word: string, placements: Placement[], dict: Dictionary,
): { ok: true; score: number } | { ok: false; score: 0; invalidWord: string } {
  if (!dict.has(word)) return { ok: false, score: 0, invalidWord: word };

  const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
  const pr = dir === 'V' ? 0 : 1, pc = dir === 'H' ? 0 : 1;
  const placedKey = new Set(placements.map(p => `${p.row},${p.col}`));
  const placedBlank = new Map(placements.map(p => [`${p.row},${p.col}`, p.blank]));

  // Main word score.
  let mainScore = 0, mainMult = 1;
  for (let i = 0; i < word.length; i++) {
    const r = row + i * dr, c = col + i * dc;
    const key = `${r},${c}`;
    const isNew = placedKey.has(key);
    const blank = isNew ? placedBlank.get(key)! : board[r][c].blank;
    const base = blank ? 0 : (LETTER_VALUE[word[i]] ?? 0);
    let ls = base;
    if (isNew) {
      const prem = PREMIUM_GRID[r][c];
      if (prem === 'DL') ls *= 2;
      else if (prem === 'TL') ls *= 3;
      else if (prem === 'DW') mainMult *= 2;
      else if (prem === 'TW') mainMult *= 3;
    }
    mainScore += ls;
  }
  let total = mainScore * mainMult;

  // Cross-word at each newly placed position.
  for (const p of placements) {
    let sr = p.row - pr, sc = p.col - pc;
    while (inBounds(sr, sc) && board[sr][sc].letter) { sr -= pr; sc -= pc; }
    sr += pr; sc += pc;
    let er = p.row + pr, ec = p.col + pc;
    while (inBounds(er, ec) && board[er][ec].letter) { er += pr; ec += pc; }
    er -= pr; ec -= pc;

    // Single-tile cross-word (no neighbors) → ignore.
    if (sr === p.row && sc === p.col && er === p.row && ec === p.col) continue;

    let crossWord = '', crossScore = 0, crossMult = 1;
    let rr = sr, cc = sc;
    while (true) {
      const isThis = rr === p.row && cc === p.col;
      const letter = isThis ? p.letter : board[rr][cc].letter!;
      const blank = isThis ? p.blank : board[rr][cc].blank;
      crossWord += letter;
      const base = blank ? 0 : (LETTER_VALUE[letter] ?? 0);
      let ls = base;
      if (isThis) {
        const prem = PREMIUM_GRID[rr][cc];
        if (prem === 'DL') ls *= 2;
        else if (prem === 'TL') ls *= 3;
        else if (prem === 'DW') crossMult *= 2;
        else if (prem === 'TW') crossMult *= 3;
      }
      crossScore += ls;
      if (rr === er && cc === ec) break;
      rr += pr; cc += pc;
    }
    if (!dict.has(crossWord)) return { ok: false, score: 0, invalidWord: crossWord };
    total += crossScore * crossMult;
  }

  if (placements.length === RACK_SIZE) total += BINGO_BONUS;
  return { ok: true, score: total };
}

export interface FindMovesOptions {
  rack: string[];
  maxLen?: number;
  topN?: number;
}

// Precompute, for each empty cell, the set of letters that form a valid
// perpendicular cross-word (Appel & Jacobson 1988). `null` means no
// perpendicular neighbors → any letter is allowed.
//   crossOk[mainDir][r][c] = letters allowed at (r,c) when the main word
//   runs in mainDir (the cross-word runs perpendicular to that).
type CrossOk = (Set<string> | null)[][];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function computeCrossOk(board: Board, dict: Dictionary, mainDir: Direction): CrossOk {
  // Perpendicular step: if main is H, cross runs vertically.
  const pr = mainDir === 'H' ? 1 : 0;
  const pc = mainDir === 'H' ? 0 : 1;
  const grid: CrossOk = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: (Set<string> | null)[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].letter) { row.push(null); continue; }
      let above = '';
      for (let i = 1; ; i++) {
        const nr = r - i * pr, nc = c - i * pc;
        if (!inBounds(nr, nc) || !board[nr][nc].letter) break;
        above = board[nr][nc].letter! + above;
      }
      let below = '';
      for (let i = 1; ; i++) {
        const nr = r + i * pr, nc = c + i * pc;
        if (!inBounds(nr, nc) || !board[nr][nc].letter) break;
        below += board[nr][nc].letter!;
      }
      if (!above && !below) { row.push(null); continue; }
      const set = new Set<string>();
      for (const L of ALPHABET) {
        if (dict.has(above + L + below)) set.add(L);
      }
      row.push(set);
    }
    grid.push(row);
  }
  return grid;
}

export function findMoves(board: Board, dict: Dictionary, opts: FindMovesOptions): Move[] {
  const rack = toRack(opts.rack);
  const maxLen = Math.min(opts.maxLen ?? BOARD_SIZE, BOARD_SIZE);
  const firstMove = isBoardEmpty(board);
  const anchorsList = firstMove ? [[CENTER, CENTER] as [number, number]] : anchors(board);
  const moves: Move[] = [];

  // Cross-check sets: precomputed once, reused across all anchors. Only useful
  // on non-empty boards (no perpendicular neighbors on the first move anyway).
  const crossH = firstMove ? null : computeCrossOk(board, dict, 'H');
  const crossV = firstMove ? null : computeCrossOk(board, dict, 'V');

  // Letters available in the rack ∪ blank? Used to short-circuit cross-check
  // intersection: a candidate word using a letter you don't have is dead.
  const rackHas: Record<string, boolean> = {};
  for (const L of ALPHABET) rackHas[L] = (rack.letters[L] ?? 0) > 0 || rack.blanks > 0;

  for (const [ar, ac] of anchorsList) {
    for (const dir of ['H', 'V'] as Direction[]) {
      const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
      const cross = dir === 'H' ? crossH : crossV;

      // How far left/above the anchor can the word start? Only across empty cells.
      let maxPrefix = 0;
      for (let i = 1; i <= rack.size; i++) {
        const r = ar - i * dr, c = ac - i * dc;
        if (!inBounds(r, c)) break;
        if (board[r][c].letter) break;
        maxPrefix++;
      }

      for (let prefix = 0; prefix <= maxPrefix; prefix++) {
        const row = ar - prefix * dr, col = ac - prefix * dc;

        for (let len = Math.max(2, prefix + 1); len <= maxLen; len++) {
          if (firstMove) {
            const endR = row + (len - 1) * dr, endC = col + (len - 1) * dc;
            const coversCenter = dir === 'H'
              ? (row === CENTER && CENTER >= col && CENTER <= endC)
              : (col === CENTER && CENTER >= row && CENTER <= endR);
            if (!coversCenter) continue;
          }

          const pattern = slotPattern(board, row, col, dir, len);
          if (!pattern) {
            // Slot ran off the board or hit a post-end collision: longer lengths won't help.
            break;
          }
          if (pattern.blanks > rack.size) continue;

          for (const word of dict.byLength(len)) {
            let ok = true;
            for (let i = 0; i < len; i++) {
              const forced = pattern.existing[i];
              if (forced) {
                if (forced !== word[i]) { ok = false; break; }
              } else if (cross) {
                const r = row + i * dr, c = col + i * dc;
                const allowed = cross[r][c];
                if (allowed && !allowed.has(word[i])) { ok = false; break; }
                // Rack check is cheap and prunes early.
                if (!rackHas[word[i]]) { ok = false; break; }
              }
            }
            if (!ok) continue;
            const placements = buildPlacements(row, col, dir, word, pattern.existing, rack);
            if (!placements) continue;
            const { ok: scoreOk, score } = scorePlacement(board, row, col, dir, word, placements, dict);
            if (!scoreOk) continue;

            moves.push({
              row, col, dir, word, placements, score,
              bingo: placements.length === RACK_SIZE,
            });
          }
        }
      }
    }
  }

  moves.sort((a, b) => b.score - a.score);
  return dedupeMoves(moves, opts.topN);
}

function dedupeMoves(moves: Move[], topN?: number): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    const key = `${m.dir}:${m.row},${m.col}:${m.word}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (topN && out.length >= topN) break;
  }
  return out;
}

// Validate a player-chosen set of placements, returning the derived Move
// (with score) or an error reason. Used to score the word the player typed.
export function validatePlayerMove(
  board: Board, placements: Placement[], dict: Dictionary,
): { move: Move; reasons: string[] } | { error: string } {
  if (placements.length === 0) return { error: 'Aucune lettre posée.' };

  const rows = new Set(placements.map(p => p.row));
  const cols = new Set(placements.map(p => p.col));
  const dir: Direction = rows.size === 1 ? 'H' : cols.size === 1 ? 'V' : 'X' as Direction;
  if (dir === ('X' as Direction)) return { error: 'Les lettres doivent être alignées.' };

  const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
  const pr = dir === 'V' ? 0 : 1, pc = dir === 'H' ? 0 : 1;

  // Determine start of the main word by walking backwards from the earliest placement.
  const sorted = [...placements].sort((a, b) => dir === 'H' ? a.col - b.col : a.row - b.row);
  let row = sorted[0].row, col = sorted[0].col;
  while (inBounds(row - dr, col - dc) && board[row - dr][col - dc].letter) { row -= dr; col -= dc; }

  let end = 0;
  const last = sorted[sorted.length - 1];
  end = dir === 'H' ? last.col : last.row;
  while (inBounds(end + dr + (dir === 'H' ? 0 : 0), end + dc + (dir === 'H' ? 0 : 0))) {
    const nr = dir === 'H' ? last.row : end + 1, nc = dir === 'H' ? end + 1 : last.col;
    if (!inBounds(nr, nc)) break;
    if (!board[nr][nc].letter) break;
    end++;
  }
  const len = dir === 'H' ? (end - col + 1) : (end - row + 1);
  if (len < 2) return { error: 'Le mot doit faire au moins 2 lettres.' };

  // Reconstruct word along the line.
  let word = '';
  for (let i = 0; i < len; i++) {
    const r = row + i * dr, c = col + i * dc;
    const placed = placements.find(p => p.row === r && p.col === c);
    if (placed) word += placed.letter;
    else if (board[r][c].letter) word += board[r][c].letter!;
    else return { error: 'Trou dans le mot.' };
  }

  // Connectivity: first move must cover center; otherwise must touch ≥1 existing tile.
  const firstMove = isBoardEmpty(board);
  if (firstMove) {
    const coversCenter = dir === 'H'
      ? row === CENTER && CENTER >= col && CENTER <= col + len - 1
      : col === CENTER && CENTER >= row && CENTER <= row + len - 1;
    if (!coversCenter) return { error: 'Le premier mot doit passer par le centre (★).' };
  } else {
    const touchesExisting = placements.some(p =>
      (inBounds(p.row - 1, p.col) && board[p.row - 1][p.col].letter) ||
      (inBounds(p.row + 1, p.col) && board[p.row + 1][p.col].letter) ||
      (inBounds(p.row, p.col - 1) && board[p.row][p.col - 1].letter) ||
      (inBounds(p.row, p.col + 1) && board[p.row][p.col + 1].letter),
    );
    // A hook play (1 tile extending an existing word) also counts because the
    // main word length > 1 — the tile touches the rest via the word line itself.
    if (!touchesExisting) return { error: 'Le mot doit toucher une lettre existante.' };
  }

  const result = scorePlacement(board, row, col, dir, word, placements, dict);
  if (!result.ok) {
    const bad = result.invalidWord;
    const msg = bad === word
      ? `"${word}" n'est pas dans le dictionnaire.`
      : `Mot croisé "${bad}" invalide.`;
    return { error: msg };
  }

  return {
    move: { row, col, dir, word, placements, score: result.score, bingo: placements.length === RACK_SIZE },
    reasons: [],
  };
}
