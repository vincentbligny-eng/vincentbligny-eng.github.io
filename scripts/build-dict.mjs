#!/usr/bin/env node
// Normalizes a French wordlist to Scrabble conventions (uppercase,
// accents stripped, ligatures expanded), filters 2–15 letters,
// writes /public/dict-fr.txt (one word per line).
//
// Source priority:
//   1. First CLI arg             →  node scripts/build-dict.mjs ~/ods8.txt
//   2. WORDLIST_FILE env         →  WORDLIST_FILE=~/ods8.txt npm run build-dict
//   3. WORDLIST_URL env          →  WORDLIST_URL=https://…            npm run build-dict
//                                   (comma-separated for multiple URLs)
//   4. DEFAULT_URLS (merged)     →  hbenbel + lorenbrichter public French lists
//
// Strict-ODS mode: no seed merge. The ODS8 source IS the dictionary.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// Strict ODS8: ~411k entries, already normalized (uppercase, no accents).
// This is the authoritative reference — we don't merge other lists, since
// any extra word would weaken "respect ODS strictly".
const DEFAULT_URLS = [
  'https://raw.githubusercontent.com/Thecoolsim/French-Scrabble-ODS8/master/French%20ODS%20dictionary.txt',
];
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(SCRIPT_DIR, '../public/dict-fr.txt');

function expandHome(p) {
  return p.startsWith('~') ? resolve(homedir(), p.slice(p[1] === '/' ? 2 : 1)) : resolve(p);
}

function normalize(w) {
  return w
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
    .toUpperCase();
}

function collect(text, into) {
  let kept = 0;
  for (const line of text.split(/\r?\n/)) {
    const w = normalize(line.trim());
    if (/^[A-Z]{2,15}$/.test(w) && !into.has(w)) {
      into.add(w);
      kept++;
    }
  }
  return kept;
}

const fileArg = process.argv[2] ?? process.env.WORDLIST_FILE;
const sources = [];
if (fileArg) {
  sources.push({ kind: 'file', ref: expandHome(fileArg) });
} else if (process.env.WORDLIST_URL) {
  for (const u of process.env.WORDLIST_URL.split(',')) sources.push({ kind: 'url', ref: u.trim() });
} else {
  for (const u of DEFAULT_URLS) sources.push({ kind: 'url', ref: u });
}

const words = new Set();
for (const s of sources) {
  const text = s.kind === 'file' ? readFileSync(s.ref, 'utf8') : await fetch(s.ref).then(r => r.text());
  const added = collect(text, words);
  console.log(`${s.kind === 'file' ? '📁' : '🌐'} ${s.ref}\n   +${added.toLocaleString('en')} (running total ${words.size.toLocaleString('en')})`);
}

const sorted = [...words].sort();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, sorted.join('\n') + '\n');
console.log(`\n→ ${sorted.length.toLocaleString('en')} words written to ${OUT}`);
