<script lang="ts">
  import type { DuelOutcome } from '../engine/game';
  import type { Move } from '../engine/types';
  import Definition from './Definition.svelte';

  export let outcomes: DuelOutcome[];
  export let topMove: Move | null;
  export let topScore: number;
  export let ordiMove: Move | null = null;
  export let ordiScore: number = 0;
  export let humanOverride: { playerId: string; playerName: string } | null = null;
  export let playerColors: Record<string, string> = {};
  export let onContinue: () => void = () => {};

  function colLabel(c: number): string { return String.fromCharCode(65 + c); }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onContinue(); }
  }

  $: bestHumanDiff = outcomes.reduce((m, o) => Math.max(m, o.diff), -Infinity);
</script>

<svelte:window on:keydown={handleKey} />

<div class="panel p-5 space-y-4 animate-slide-up">
  <header>
    <p class="text-xs uppercase tracking-widest text-mist-500 font-mono">Résultat de la manche</p>
    {#if humanOverride && topMove}
      <h3 class="text-lg">
        🙇 <span class="text-amber-300 font-display">Sorry-sorry !</span>
        {humanOverride.playerName} joue
        <span class="text-neon-glow font-display">{topMove.word}</span>
        · <span class="font-mono text-neon">{topScore} pts</span>
      </h3>
      {#if ordiMove}
        <p class="text-xs text-mist-500 mt-1">
          (Ordi avait <span class="font-display">{ordiMove.word}</span> pour {ordiScore} pts)
        </p>
      {/if}
    {:else if topMove}
      <h3 class="text-lg">
        🤖 Ordi joue <span class="text-neon-glow font-display">{topMove.word}</span>
        · <span class="font-mono text-neon">{topScore} pts</span>
      </h3>
    {:else}
      <h3 class="text-lg">Aucun coup possible — l'Ordi passe.</h3>
    {/if}
    {#if topMove}
      <Definition word={topMove.word} />
    {/if}
  </header>

  <div class="grid sm:grid-cols-2 gap-3">
    {#each outcomes as o}
      {@const color = playerColors[o.playerId] ?? '#a3e635'}
      {@const isTop = o.move && o.diff === 0}
      {@const isBest = !isTop && o.diff === bestHumanDiff && outcomes.length > 1}
      <div
        class="rounded-xl p-4 border transition relative overflow-hidden
               {isTop
                 ? 'bg-white/5 border-white/20 shadow-[0_0_40px_-6px_currentColor]'
                 : isBest ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.02] border-white/5'}"
        style={isTop ? `color: ${color};` : ''}
      >
        {#if isTop}
          <div class="absolute -top-6 -right-6 text-5xl opacity-30">🎯</div>
        {/if}
        <div class="flex items-baseline justify-between gap-2">
          <p class="font-display font-semibold truncate flex items-baseline gap-2" style="color: {color};">
            <span>{o.playerName}{#if isTop} · top !{/if}</span>
            {#if o.appliedHint}
              <span title="A appliqué un conseil de l'aide progressive"
                    class="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded
                           bg-rose-glow/20 text-rose-glow border border-rose-glow/40">
                🚨 conseil appliqué
              </span>
            {:else if o.usedHints}
              <span title="A consulté la liste des suggestions"
                    class="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded
                           bg-amber-300/15 text-amber-300 border border-amber-300/40">
                👀 a regardé
              </span>
            {/if}
          </p>
          <span class="font-mono text-sm text-mist-500">
            {o.score} / {topScore}
          </span>
        </div>
        <div class="mt-2 flex items-baseline gap-3 flex-wrap">
          {#if o.move}
            <p class="font-display text-2xl" style="color: {color};">{o.move.word}</p>
            <p class="font-mono text-xl" style="color: {o.diff === 0 ? '#a3e635' : '#9aa3b7'};">
              {o.diff === 0 ? '±0' : o.diff}
            </p>
            {#if (o.decayMultiplier ?? 1) < 1}
              <span class="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded
                           bg-rose-glow/20 text-rose-glow border border-rose-glow/40"
                    title="Score réduit par le compte à rebours">
                ⏱ {o.rawScore} × {Math.round((o.decayMultiplier ?? 1) * 100)}%
              </span>
            {/if}
          {:else if o.error}
            <p class="text-xs text-rose-glow italic">{o.error} · écart {o.diff}</p>
          {:else}
            <p class="text-xs text-mist-500 italic">— passé — écart {o.diff}</p>
          {/if}
        </div>
        {#if o.move}
          <p class="text-[11px] text-mist-500 font-mono mt-1">
            {o.move.dir === 'H' ? '→' : '↓'} {colLabel(o.move.col)}{o.move.row + 1}
            {#if o.move.bingo}<span class="ml-2 text-neon-glow">BINGO</span>{/if}
          </p>
          {#if o.move.word !== topMove?.word}
            <Definition word={o.move.word} compact />
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <button class="btn-primary w-full" on:click={onContinue}>
    Continuer <span class="ml-2 opacity-60 text-xs font-mono">⏎</span>
  </button>
</div>
