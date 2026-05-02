import { DISTRIBUTION, RACK_SIZE } from './constants';
import { randInt } from './rng';

export function createBag(): string[] {
  const bag: string[] = [];
  for (const [letter, { count }] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  return bag;
}

export function shuffle(bag: string[], rand: () => number): string[] {
  const out = [...bag];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Refill a rack from the bag. Honors `reserve`: each reserved letter is pulled
// from the bag first (if present); the rest is drawn randomly. Falls back
// silently when a reserved letter is no longer available.
export function refill(
  rack: string[],
  bag: string[],
  rand: () => number,
  reserve: string[] = [],
): { rack: string[]; bag: string[]; honored: string[]; unmet: string[] } {
  const nextBag = [...bag];
  const nextRack = [...rack];
  const honored: string[] = [];
  const unmet: string[] = [];

  const take = (letter: string): boolean => {
    const idx = nextBag.indexOf(letter);
    if (idx === -1) return false;
    nextBag.splice(idx, 1);
    nextRack.push(letter);
    return true;
  };

  for (const letter of reserve) {
    if (nextRack.length >= RACK_SIZE || nextBag.length === 0) break;
    if (take(letter)) honored.push(letter);
    else unmet.push(letter);
  }

  while (nextRack.length < RACK_SIZE && nextBag.length > 0) {
    const i = randInt(rand, nextBag.length);
    nextRack.push(nextBag.splice(i, 1)[0]);
  }

  return { rack: nextRack, bag: nextBag, honored, unmet };
}
