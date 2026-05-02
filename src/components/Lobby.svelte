<script lang="ts">
  import type { LobbyPlayer } from '../lib/session';

  export let players: LobbyPlayer[];
  export let myClientId: string;
  export let hostClientId: string | null;
  export let canStart: boolean;
  export let dictLoading = false;
  export let onRename: (playerId: string, name: string) => void = () => {};
  export let onAddSeat: (name: string) => void = () => {};
  export let onLeave: () => void = () => {};
  export let onStart: () => void = () => {};

  $: iAmHost = hostClientId === myClientId;
  $: myPlayers = players.filter(p => p.clientId === myClientId);
  // Show the host badge on a single seat: the first seat owned by the host device.
  $: hostBadgePlayerId = hostClientId
    ? players.find(p => p.clientId === hostClientId)?.playerId ?? null
    : null;

  let editingId: string | null = null;
  let draftName = '';
  function beginEdit(p: LobbyPlayer) {
    editingId = p.playerId;
    draftName = p.name;
  }
  function commit() {
    const t = draftName.trim();
    const target = players.find(p => p.playerId === editingId);
    if (t && target && t !== target.name) onRename(target.playerId, t);
    editingId = null;
  }

  let newSeatName = '';
  function addSeat() {
    const t = newSeatName.trim();
    if (!t) return;
    onAddSeat(t);
    newSeatName = '';
  }
</script>

<div class="max-w-2xl mx-auto px-4 py-10 space-y-6 animate-slide-up">
  <div class="text-center space-y-2">
    <p class="text-xs uppercase tracking-[0.2em] text-mist-500 font-mono">Salon</p>
    <h1 class="font-display text-3xl sm:text-4xl">En attente du départ…</h1>
    <p class="text-mist-500 text-sm max-w-md mx-auto">
      Plusieurs joueurs peuvent partager cet appareil — chacun jouera à son tour.
      {#if iAmHost}Quand tout le monde est prêt, lance la partie.{/if}
    </p>
  </div>

  <section class="panel p-5 space-y-3">
    <header class="flex items-center justify-between">
      <h2 class="text-sm font-mono uppercase tracking-wider text-mist-500">
        Joueurs · {players.length}
      </h2>
      <span class="text-xs text-mist-500">🤖 Ordi (référence)</span>
    </header>
    <ul class="space-y-2">
      {#each players as p (p.playerId)}
        {@const isMine = p.clientId === myClientId}
        {@const isHost = p.playerId === hostBadgePlayerId}
        <li
          class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: {p.color};"></span>
          {#if isMine && editingId === p.playerId}
            <input
              type="text"
              bind:value={draftName}
              class="flex-1 bg-transparent border border-white/10 rounded-md px-2 py-1 font-display focus:outline-none focus:border-neon"
              maxlength="18"
              on:blur={commit}
              on:keydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') editingId = null; }}
              autofocus
            />
          {:else}
            <button
              class="flex-1 text-left font-display truncate transition
                     {isMine ? 'hover:text-neon-glow' : 'cursor-default'}"
              style="color: {p.color};"
              disabled={!isMine}
              on:click={() => beginEdit(p)}
              title={isMine ? 'Modifier le nom' : ''}
            >
              {p.name}{#if isMine}<span class="text-mist-500 text-xs"> · ici</span>{/if}
            </button>
          {/if}
          {#if isHost}
            <span class="chip bg-neon/15 text-neon-glow border border-neon/30">hôte</span>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="flex gap-2 pt-2 border-t border-white/5">
      <input
        type="text"
        bind:value={newSeatName}
        placeholder="Ajouter un joueur sur cet appareil…"
        maxlength="18"
        class="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-neon"
        on:keydown={(e) => { if (e.key === 'Enter') addSeat(); }}
      />
      <button class="btn-ghost text-sm" on:click={addSeat} disabled={!newSeatName.trim()}>+ Ajouter</button>
    </div>
  </section>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <button class="btn-ghost text-sm" on:click={onLeave}>
      {myPlayers.length > 1 ? 'Retirer mes joueurs' : 'Quitter'}
    </button>
    {#if iAmHost}
      <button
        class="btn-primary text-base flex-1 sm:flex-none"
        disabled={!canStart || dictLoading}
        on:click={onStart}
      >
        {#if dictLoading}
          Chargement du dictionnaire…
        {:else if !canStart}
          Il faut au moins 2 joueurs
        {:else}
          Démarrer la partie
        {/if}
      </button>
    {:else}
      <p class="text-sm text-mist-500 italic">En attente du démarrage par l'hôte…</p>
    {/if}
  </div>
</div>
