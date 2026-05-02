<script lang="ts">
  import { fetchDefinition, wiktionnaireUrl, type DefinitionResult } from '../lib/definitions';

  export let word: string = '';
  export let compact: boolean = false;

  let result: DefinitionResult | null = null;
  let loading = false;

  $: if (word) load(word);

  async function load(w: string) {
    loading = true;
    result = null;
    const r = await fetchDefinition(w);
    // Guard against an out-of-order response if `word` changed since we started.
    if (r.word === w.toLowerCase()) {
      result = r;
      loading = false;
    }
  }
</script>

{#if word}
  <p class="definition {compact ? 'definition-compact' : ''}">
    {#if loading}
      <span class="opacity-50">…</span>
    {:else if result?.text}
      <span>{result.text}</span>
      <a href={result.url} target="_blank" rel="noopener noreferrer" class="def-link" aria-label="Voir sur Wiktionnaire">↗</a>
    {:else}
      <a href={wiktionnaireUrl(word)} target="_blank" rel="noopener noreferrer" class="def-link">
        Voir sur Wiktionnaire ↗
      </a>
    {/if}
  </p>
{/if}

<style>
  .definition {
    font-size: 11px;
    line-height: 1.4;
    color: #9aa3b7;
    font-style: italic;
    margin-top: 4px;
  }
  .definition-compact {
    font-size: 10px;
    margin-top: 2px;
  }
  .def-link {
    color: #a3e635;
    font-style: normal;
    margin-left: 2px;
    text-decoration: none;
  }
  .def-link:hover { text-decoration: underline; }
</style>
