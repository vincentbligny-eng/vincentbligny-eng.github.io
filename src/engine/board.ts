import { BOARD_SIZE } from './constants';
import type { Board, Cell, Move } from './types';

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, (): Cell => ({ letter: null, blank: false, turn: null })),
  );
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function cloneBoard(b: Board): Board {
  return b.map(row => row.map(cell => ({ ...cell })));
}

export function applyMove(b: Board, m: Move, turn: number): Board {
  const next = cloneBoard(b);
  for (const p of m.placements) {
    next[p.row][p.col] = { letter: p.letter, blank: p.blank, turn };
  }
  return next;
}

export function isBoardEmpty(b: Board): boolean {
  for (const row of b) for (const c of row) if (c.letter) return false;
  return true;
}
