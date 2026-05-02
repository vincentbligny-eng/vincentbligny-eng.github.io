<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TurnRow } from '../lib/session';
  import Definition from './Definition.svelte';

  export let history: TurnRow[];
  export let playerColors: Record<string, string> = {};
  export let onClose: () => void = () => {};

  function colLabel(c: number): string { return String.fromCharCode(65 + c); }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  onMount(() => { document.body.style.overflow = 'hidden'; });
  onDestroy(() => { document.body.style.overflow = ''; });
</script>

<svelte:window on:keydown={onKey} />

<div class="fixed inset-0 z-40 grid place-items-center p-3 sm:p-6 bg-night-900/80 backdrop-blur-sm animate-pop-in"
     on:click|self={onClose}>
  <div class="panel w-full max-w-3xl h-[85vh] flex flex-col">
    <header class="px-5 py-4 border-b border-white/10 flex items-center justify-between">
      <div>
        <p class="text-xs uppercase tracking-widest text-mist-500 font-mono">Partie en cours</p>
        <h2 class="text-xl font-display">Historique complet</h2>
      </div>
      <button class="btn-ghost !px-3 !py-1.5 text-sm" on:click={onClose} aria-label="Fermer">✕</button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
      {#if history.length === 0}
        <p class="text-mist-500 italic text-center py-12">Aucune manche jouée pour l'instant.</p>
      {:else}
        {#each [...history].reverse() as row (row.turn)}
          <article class="border-b border-white/5 pb-4 last:border-0">
            <header class="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
              <h3 class="font-display text-base">
                Manche <span class="text-mist-500 font-mono">#{row.turn}</span>
              </h3>
              {#if row.topMove}
                <p class="font-mono text-sm">
                  {#if row.humanOverride}
                    🙇 {row.humanOverride.playerName}
                  {:else}
                    🤖 Ordi
                  {/if}
                  · <span class="font-display text-neon-glow">{row.topMove.word}</span>
                  · <span class="text-neon">{row.topScore} pts</span>
                  <span class="text-mist-500 ml-1">
                    ({row.topMove.dir === 'H' ? '→' : '↓'} {colLabel(row.topMove.col)}{row.topMove.row + 1})
                  </span>
                </p>
              {:else}
                <p class="text-sm text-mist-500 italic">Aucun coup possible</p>
              {/if}
            </header>

            {#if row.topMove}
              <Definition word={row.topMove.word} compact />
            {/if}
            {#if row.humanOverride && row.ordiMove && row.ordiMove.word !== row.topMove?.word}
              <p class="text-[11px] text-mist-500 mt-1">
                Ordi avait <span class="font-display">{row.ordiMove.word}</span>
                · {row.ordiScore ?? row.ordiMove.score} pts
              </p>
            {/if}

            <ul class="mt-3 space-y-1.5">
              {#each row.outcomes as o}
                {@const color = playerColors[o.playerId] ?? '#9aa3b7'}
                <li class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                    <span class="font-display truncate" style="color: {color};">{o.playerName}</span>
                    {#if o.appliedHint}
                      <span class="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded
                                   bg-rose-glow/20 text-rose-glow border border-rose-glow/40">🚨 conseil</span>
                    {:else if o.usedHints}
                      <span class="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded
                                   bg-amber-300/15 text-amber-300 border border-amber-300/40">👀</span>
                    {/if}
                    {#if o.move}
                      <span class="font-display" style="color: {color};">{o.move.word}</span>
                    {:else if o.error}
                      <span class="text-rose-glow italic text-xs">— {o.error}</span>
                    {:else}
                      <span class="text-mist-500 italic text-xs">— passé —</span>
                    {/if}
                  </span>
                  <span class="font-mono shrink-0 flex items-baseline gap-2">
                    <span class="text-mist-500">{o.score}</span>
                    <span style="color: {o.diff === 0 ? '#a3e635' : color};">
                      {o.diff === 0 ? '±0' : o.diff}
                    </span>
                  </span>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      {/if}
    </div>

    <footer class="px-5 py-3 border-t border-white/10 flex justify-end">
      <button class="btn-ghost text-sm" on:click={onClose}>
        Fermer <span class="ml-1 text-xs opacity-60 font-mono">Esc</span>
      </button>
    </footer>
  </div>
</div>
