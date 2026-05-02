<script lang="ts">
  import type { DuelOutcome } from '../engine/game';
  import type { Move } from '../engine/types';

  export interface Player { id: string; name: string; rawScore: number; color: string; }
  export interface TurnRow {
    turn: number;
    outcomes: DuelOutcome[];
    topMove: Move | null;
    topScore: number;
    humanOverride?: { playerId: string; playerName: string } | null;
  }

  export let players: Player[];
  export let history: TurnRow[];
  export let currentPlayerId: string;
  export let turn: number;
  export let topScoreCum: number;  // Ordi's cumulative top score
</script>

<section class="panel p-5 space-y-4">
  <header class="flex items-center justify-between">
    <div>
      <h3 class="text-lg">Duel</h3>
      <p class="text-xs text-mist-500">Manche {turn} · chaque coup est comparé au meilleur (Ordi)</p>
    </div>
  </header>

  <!-- Player cards including the virtual "Ordi" reference. -->
  <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));">
    {#each players as p}
      {@const isCurrent = p.id === currentPlayerId}
      {@const diff = p.rawScore - topScoreCum}
      <div
        class="rounded-xl p-3 border transition
               {isCurrent ? 'border-white/20 shadow-[0_0_24px_-6px_currentColor]' : 'border-white/5'}"
        style="background: {p.color}14; color: {p.color};"
      >
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full" style="background: {p.color};"></span>
          <span class="text-[10px] font-mono uppercase tracking-wider text-mist-500">
            {isCurrent ? 'À jouer' : 'En attente'}
          </span>
        </div>
        <p class="font-display font-semibold truncate text-sm" style="color: {p.color};">{p.name}</p>
        <p class="font-display text-2xl leading-none mt-0.5" style="color: {p.color};">{p.rawScore}</p>
        <p class="text-[10px] font-mono text-mist-500 mt-0.5">
          écart <span style="color: {p.color}">{diff >= 0 ? '±0' : diff}</span>
        </p>
      </div>
    {/each}
    <!-- Ordi reference card -->
    <div class="rounded-xl p-3 border border-white/10 bg-white/[0.04]">
      <div class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-neon"></span>
        <span class="text-[10px] font-mono uppercase tracking-wider text-mist-500">Référence</span>
      </div>
      <p class="font-display font-semibold text-sm text-mist-100">🤖 Ordi</p>
      <p class="font-display text-2xl leading-none mt-0.5 text-neon">{topScoreCum}</p>
      <p class="text-[10px] font-mono text-mist-500 mt-0.5">maximum</p>
    </div>
  </div>

  <div class="border-t border-white/5 pt-3">
    <h4 class="text-xs font-mono uppercase tracking-wider text-mist-500 mb-2">Historique</h4>
    <div class="space-y-1 max-h-56 overflow-auto pr-1 text-xs">
      {#if history.length === 0}
        <p class="text-mist-500">Aucune manche jouée.</p>
      {:else}
        {#each [...history].reverse() as row}
          <div class="flex items-baseline gap-2">
            <span class="text-mist-500 font-mono w-6">{row.turn}</span>
            <div class="flex-1 min-w-0 space-y-0.5">
              {#if row.topMove}
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-neon-glow font-display truncate">
                    {#if row.humanOverride}🙇 {row.humanOverride.playerName}{:else}🤖 Ordi{/if} · {row.topMove.word}
                  </span>
                  <span class="font-mono text-neon">{row.topScore}</span>
                </div>
              {/if}
              {#each row.outcomes as o}
                {@const color = players.find(p => p.id === o.playerId)?.color ?? '#9aa3b7'}
                <div class="flex items-baseline justify-between gap-2">
                  <span class="font-display truncate" style="color: {color};">
                    {#if o.move}{o.move.word}{:else}— passé —{/if}
                  </span>
                  <span class="font-mono flex items-baseline gap-2">
                    <span class="text-mist-500">{o.score}</span>
                    <span style="color: {o.diff === 0 ? '#a3e635' : color};">{o.diff === 0 ? '±0' : o.diff}</span>
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</section>
