<script lang="ts">
  import type { LobbyPlayer, SubmissionRecord } from '../lib/session';

  export let players: LobbyPlayer[];
  export let submissions: Record<string, SubmissionRecord>;
  export let myClientId: string;

  $: ready = players.filter(p => submissions[p.playerId] !== undefined).length;
</script>

<section class="panel p-5 space-y-4 animate-slide-up">
  <header class="flex items-center justify-between">
    <div>
      <p class="text-xs uppercase tracking-widest text-mist-500 font-mono">En attente</p>
      <h3 class="text-lg">
        {ready}/{players.length} joueur{players.length > 1 ? 's' : ''} · tu as joué, patience…
      </h3>
    </div>
    <span class="inline-block w-3 h-3 rounded-full bg-neon animate-pulse" title="en direct"></span>
  </header>
  <ul class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
    {#each players as p (p.playerId)}
      {@const done = submissions[p.playerId] !== undefined}
      <li
        class="rounded-xl p-3 border text-sm transition
               {done ? 'border-white/15 bg-white/5' : 'border-white/5 bg-white/[0.02] animate-pulse'}"
        style="color: {done ? p.color : '#9aa3b7'};"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-display truncate">
            {p.name}{#if p.clientId === myClientId}<span class="opacity-60 text-xs"> · toi</span>{/if}
          </span>
          <span class="text-xs font-mono {done ? 'text-neon-glow' : 'text-mist-500'}">
            {done ? '✓ joué' : '⋯ réfléchit'}
          </span>
        </div>
      </li>
    {/each}
  </ul>
</section>
