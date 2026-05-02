<script lang="ts">
  import type { TurnRecord } from '../engine/types';

  export let history: TurnRecord[];
  export let totalScore: number;
  export let topScore: number;

  $: efficiency = topScore > 0 ? Math.round((totalScore / topScore) * 100) : 0;
</script>

<section class="panel p-5 space-y-4">
  <header>
    <h3 class="text-lg">Partie</h3>
    <p class="text-xs text-mist-500">Mode duplicate : le meilleur coup est joué à chaque tour.</p>
  </header>

  <div class="grid grid-cols-3 gap-3">
    <div>
      <p class="text-[10px] uppercase tracking-widest text-mist-500 font-mono">Score</p>
      <p class="text-2xl font-display text-ember">{totalScore}</p>
    </div>
    <div>
      <p class="text-[10px] uppercase tracking-widest text-mist-500 font-mono">Maximum</p>
      <p class="text-2xl font-display text-neon">{topScore}</p>
    </div>
    <div>
      <p class="text-[10px] uppercase tracking-widest text-mist-500 font-mono">Efficacité</p>
      <p class="text-2xl font-display">{efficiency}%</p>
    </div>
  </div>

  <div class="border-t border-white/5 pt-3 space-y-1.5 max-h-64 overflow-auto pr-1">
    {#if history.length === 0}
      <p class="text-xs text-mist-500">Aucun coup joué.</p>
    {:else}
      {#each [...history].reverse() as h}
        <div class="flex items-baseline gap-3 text-sm">
          <span class="font-mono text-xs text-mist-500 w-6">{h.turn}</span>
          <span class="flex-1 min-w-0">
            {#if h.playerMove}
              <span class="font-display">{h.playerMove.word}</span>
              <span class="text-xs text-mist-500 ml-1 font-mono">→ {h.playerScore}</span>
            {:else}
              <span class="text-xs text-mist-500 italic">passe</span>
            {/if}
            {#if h.topMove && h.playerMove?.word !== h.topMove.word}
              <span class="block text-xs text-mist-500 ml-0 truncate">
                top · <span class="text-neon-glow">{h.topMove.word}</span> ({h.topMove.score})
              </span>
            {/if}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</section>
