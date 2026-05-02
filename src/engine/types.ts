export type Direction = 'H' | 'V';

export interface Cell {
  letter: string | null;  // uppercase A-Z, or null if empty
  blank: boolean;         // if the tile was a blank assigned to `letter`
  turn: number | null;    // which turn number placed this tile (null if empty)
}

export type Board = Cell[][];

export interface Placement {
  row: number;
  col: number;
  letter: string;  // what the tile represents
  blank: boolean;  // true if it was a blank
}

export interface Move {
  row: number;          // start row of main word
  col: number;          // start col of main word
  dir: Direction;
  word: string;         // main word as it reads on the board
  placements: Placement[];
  score: number;
  bingo: boolean;
}

export interface RackTile {
  letter: string;   // 'A'..'Z' or '?' for blank
  id: string;       // stable id so Svelte can key rendering
}

export interface GameState {
  board: Board;
  rack: RackTile[];
  bag: string[];         // remaining letters (strings, each '?' or 'A'..'Z')
  reserved: string[];    // letters the player wants in the next refill
  turn: number;          // 1-indexed turn number, incremented after each submit
  totalScore: number;    // player's running score
  topScore: number;      // sum of all top-move scores (the "maximum")
  history: TurnRecord[];
  seed: number;
  overridden: boolean;   // did the player submit a suboptimal move this turn?
}

export interface TurnRecord {
  turn: number;
  rackBefore: string[];         // letters shown to player that turn
  playerMove: Move | null;      // null on pass / invalid
  topMove: Move | null;         // best engine move (also what got played)
  playerScore: number;
  topScore: number;
}
