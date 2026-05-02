<script lang="ts">
  import type { Move } from '../engine/types';
  import type { HintReport } from '../engine/hints';

  export let report: HintReport | null = null;
  export let loading = false;
  export let onHover: (m: Move | null) => void = () => {};
  export let onApply: (m: Move) => void = () => {};
  export let onAnalyze: () => void = () => {};

  let revealed: Record<string, boolean> = {};
  $: if (report) { /* new report → keep existing reveals */ }

  function toggle(key: string) { revealed = { ...revealed, [key]: !revealed[key] }; }

  const medal = ['🥇', '🥈', '🥉'];

  function colLabel(c: number): string { return String.fromCharCode(65 + c); }

  function premLabel(p: string | null): string {
    switch (p) {
      case 'DL': return 'Lettre × 2';
      case 'TL': return 'Lettre × 3';
      case 'DW': return 'Mot × 2';
      case 'TW': return 'Mot × 3';
      default: return '';
    }
  }
</script>

<section class="panel p-5 space-y-4">
  <header class="flex items-center justify-between">
    <div>
      <h3 class="text-lg">Aide progressive</h3>
      <p class="text-xs text-mist-500">Découvrez les indices un à un — plus vous en voyez, moins vous apprenez.</p>
    </div>
    {#if !report && !loading}
      <button class="btn-ghost !py-1.5 !px-3 text-xs" on:click={onAnalyze}>Analyser</button>
    {:else if report}
      <button class="btn-ghost !py-1.5 !px-3 text-xs" on:click={() => { revealed = {}; onAnalyze(); }}>↻</button>
    {/if}
  </header>

  {#if loading}
    <div class="text-sm text-mist-500 animate-pulse">Exploration du plateau…</div>
  {:else if !report}
    <p class="text-sm text-mist-500">Cliquez sur <em>Analyser</em> pour voir les indices disponibles.</p>
  {:else}
    <!-- Coach line: always visible, non-spoiling -->
    <div class="rounded-xl bg-ice/10 border border-ice/20 px-3 py-2 text-sm text-ice-glow animate-pop-in">
      {report.coach}
    </div>

    <!-- Rack analysis -->
    <div class="rounded-xl bg-white/5 border border-white/5 p-3 space-y-2">
      <h4 class="text-xs font-mono uppercase tracking-wider text-mist-500">Votre tirage</h4>
      <div class="grid grid-cols-3 gap-2 text-xs">
        <div><span class="text-mist-500">Valeur</span> <span class="font-mono text-mist-100 ml-1">{report.rack.value} pts</span></div>
        <div><span class="text-mist-500">V / C</span> <span class="font-mono text-mist-100 ml-1">{report.rack.vowels}/{report.rack.consonants}</span></div>
        <div><span class="text-mist-500">Équilibre</span> <span class="ml-1">{report.rack.balanced ? '✓' : '⚠'}</span></div>
      </div>
      {#if report.rack.heavy.length > 0}
        <p class="text-xs text-mist-500">Grosses lettres : <span class="font-mono text-ember">{report.rack.heavy.join(' ')}</span></p>
      {/if}
      {#if report.rack.duplicates.length > 0}
        <p class="text-xs text-mist-500">Doublons : <span class="font-mono text-mist-100">{report.rack.duplicates.join(' ')}</span></p>
      {/if}
      {#if report.rack.anagrams.length > 0}
        <div class="text-xs">
          <button class="text-mist-500 hover:text-neon-glow" on:click={() => toggle('anagrams')}>
            {revealed.anagrams ? '▾' : '▸'} {report.rack.anagrams.length} anagramme{report.rack.anagrams.length > 1 ? 's' : ''} du rack
          </button>
          {#if revealed.anagrams}
            <div class="mt-1 flex flex-wrap gap-1">
              {#each report.rack.anagrams as w}
                <span class="chip bg-white/10 text-mist-100 font-display">{w}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if report.teaser}
      <!-- Progressive teasers about the best move -->
      <div class="space-y-1.5">
        <h4 class="text-xs font-mono uppercase tracking-wider text-mist-500">Meilleur coup — indices</h4>

        <div class="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
          <span class="text-mist-500">Score max</span>
          <span class="font-mono text-neon">{report.teaser.score} pts{report.teaser.bingo ? ' 🎯' : ''}</span>
        </div>

        {#each [
          { key: 'length',  label: 'Longueur du mot',  value: `${report.teaser.length} lettres` },
          { key: 'dir',     label: 'Direction',        value: report.teaser.dir === 'H' ? 'Horizontal →' : 'Vertical ↓' },
          { key: 'first',   label: 'Première lettre',  value: report.teaser.firstLetter },
          { key: 'last',    label: 'Dernière lettre',  value: report.teaser.lastLetter },
          { key: 'loc',     label: 'Départ',           value: `${colLabel(report.teaser.col)}${report.teaser.row + 1}` },
          { key: 'blank',   label: 'Utilise un joker ?', value: report.teaser.usesBlank ? 'Oui' : 'Non' },
        ] as hint (hint.key)}
          <button
            type="button"
            class="w-full flex items-center justify-between rounded-lg bg-white/5 hover:bg-white/10
                   px-3 py-1.5 text-sm text-left transition"
            on:click={() => toggle(hint.key)}
          >
            <span class="text-mist-500">{hint.label}</span>
            {#if revealed[hint.key]}
              <span class="font-mono text-mist-100 animate-pop-in">{hint.value}</span>
            {:else}
              <span class="font-mono text-mist-500">···</span>
            {/if}
          </button>
        {/each}

        {#if report.premiumsInTop.length > 0}
          <button
            type="button"
            class="w-full flex items-center justify-between rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-sm"
            on:click={() => toggle('prem')}
          >
            <span class="text-mist-500">Cases premium utilisées</span>
            {#if revealed.prem}
              <span class="flex gap-1">
                {#each report.premiumsInTop as p}
                  <span class="chip bg-rose/20 text-rose-glow">{p}</span>
                {/each}
              </span>
            {:else}
              <span class="font-mono text-mist-500">···</span>
            {/if}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Hooks: small 1-tile extensions -->
    {#if report.hooks.length > 0}
      <div>
        <button class="w-full flex items-center justify-between text-xs font-mono uppercase tracking-wider text-mist-500 hover:text-mist-100 py-1" on:click={() => toggle('hooks')}>
          <span>{revealed.hooks ? '▾' : '▸'} Raccrocs · {report.hooks.length}</span>
        </button>
        {#if revealed.hooks}
          <ul class="mt-1 space-y-1">
            {#each report.hooks as h}
              <li class="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                <span>
                  <span class="font-mono text-ember">{h.tile}</span>
                  <span class="mx-1 text-mist-500">→</span>
                  <span class="font-display">{h.word}</span>
                </span>
                <span class="font-mono text-mist-500">{h.score} pts</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <!-- Final fallback: the three top solutions -->
    {#if report.topN.length > 0}
      <div>
        <button class="w-full flex items-center justify-between text-xs font-mono uppercase tracking-wider text-mist-500 hover:text-mist-100 py-1" on:click={() => toggle('solutions')}>
          <span>{revealed.solutions ? '▾' : '▸'} Solutions — top 3 (spoiler)</span>
        </button>
        {#if revealed.solutions}
          <ol class="mt-1 space-y-1.5">
            {#each report.topN as m, i}
              <li>
                <button
                  type="button"
                  class="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/10
                         border border-white/5 text-left transition"
                  on:pointerenter={() => onHover(m)}
                  on:pointerleave={() => onHover(null)}
                  on:focus={() => onHover(m)}
                  on:blur={() => onHover(null)}
                  on:click={() => onApply(m)}
                >
                  <span class="text-xl">{medal[i] ?? '•'}</span>
                  <span class="flex-1 min-w-0">
                    <span class="font-display text-base">{m.word}</span>
                    <span class="ml-2 text-xs text-mist-500 font-mono">
                      {m.dir === 'H' ? '→' : '↓'} {colLabel(m.col)}{m.row + 1}
                      {#if m.bingo}<span class="chip bg-neon/20 text-neon-glow ml-2">BINGO</span>{/if}
                    </span>
                  </span>
                  <span class="font-mono text-sm text-neon">+{m.score}</span>
                </button>
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  {/if}
</section>
