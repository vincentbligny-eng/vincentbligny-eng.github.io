export interface Dictionary {
  has(word: string): boolean;
  byLength(len: number): string[];
  size: number;
}

export async function loadDictionary(url?: string): Promise<Dictionary> {
  const resolved = url ?? `${import.meta.env.BASE_URL ?? '/'}dict-fr.txt`;
  const res = await fetch(resolved);
  const text = await res.text();
  return buildDictionary(text);
}

export function buildDictionary(text: string): Dictionary {
  const words = text.split('\n').map(w => w.trim()).filter(Boolean);
  const set = new Set(words);
  const byLen = new Map<number, string[]>();
  for (const w of words) {
    const arr = byLen.get(w.length) ?? [];
    arr.push(w);
    byLen.set(w.length, arr);
  }
  return {
    has: (w) => set.has(w),
    byLength: (n) => byLen.get(n) ?? [],
    size: words.length,
  };
}
