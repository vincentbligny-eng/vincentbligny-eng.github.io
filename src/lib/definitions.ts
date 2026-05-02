// French definitions via the Wiktionnaire action API.
//
// We pull the raw wikitext (the Wiktionnaire REST `summary` endpoint refuses
// cross-origin reads, but `action=parse&origin=*` works), find the first
// `# definition` lines under the French language section, and clean the
// markup. Results are cached in localStorage forever — definitions don't
// move and we avoid hammering the API on every reveal.

const CACHE_KEY = 'cdrs-defs-v1';
const MAX_FAILS_BEFORE_GIVE_UP = 3;

let cache: Record<string, string | null> | null = null;

function getCache(): Record<string, string | null> {
  if (cache) return cache;
  if (typeof localStorage === 'undefined') return (cache = {});
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'); }
  catch { cache = {}; }
  return cache!;
}

function persist() {
  if (typeof localStorage === 'undefined' || !cache) return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

// Strip Wiktionnaire wikitext markup down to readable French text.
function stripWikitext(s: string): string {
  return s
    // Italics inside templates we drop entirely; templates: {{name|...}}
    .replace(/\{\{[^{}]*\}\}/g, '')
    // Piped link [[target|display]] → display
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    // Plain link [[term]] → term
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Bold/italic apostrophe markup
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    // Any stray HTML tags
    .replace(/<[^>]+>/g, '')
    // HTML entities → readable
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstDefinition(wikitext: string): string | null {
  let inFrench = false;
  for (const raw of wikitext.split('\n')) {
    const line = raw.trimEnd();
    // Top-level language section heading
    if (/^==\s+/.test(line) && !/^===/.test(line)) {
      inFrench = /Français|\{\{langue\|fr\}\}/.test(line);
      continue;
    }
    if (!inFrench) continue;
    // Definition lines start with single '#' (sub-defs use '##' or '#:')
    if (line.startsWith('# ') && !line.startsWith('## ') && !line.startsWith('#:')) {
      const def = stripWikitext(line.slice(2));
      if (def) return def;
    }
  }
  return null;
}

export interface DefinitionResult {
  word: string;          // the looked-up form (lowercase)
  text: string | null;   // first French definition, or null if not found
  url: string;           // Wiktionnaire page URL
}

export function wiktionnaireUrl(word: string): string {
  return `https://fr.wiktionary.org/wiki/${encodeURIComponent(word.toLowerCase())}`;
}

export async function fetchDefinition(word: string): Promise<DefinitionResult> {
  const key = word.toLowerCase();
  const c = getCache();
  if (key in c) return { word: key, text: c[key], url: wiktionnaireUrl(key) };

  try {
    const apiUrl = `https://fr.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(key)}&prop=wikitext&format=json&formatversion=2&origin=*`;
    const res = await fetch(apiUrl);
    if (!res.ok) { c[key] = null; persist(); return { word: key, text: null, url: wiktionnaireUrl(key) }; }
    const data = await res.json() as { parse?: { wikitext?: string } };
    const wt = data?.parse?.wikitext;
    const text = wt ? extractFirstDefinition(wt) : null;
    c[key] = text;
    persist();
    return { word: key, text, url: wiktionnaireUrl(key) };
  } catch {
    return { word: key, text: null, url: wiktionnaireUrl(key) };
  }
}
