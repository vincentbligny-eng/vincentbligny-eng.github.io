<script lang="ts">
  export let dictLoading: boolean = false;
  export let activePlayerCount = 0;      // non-zero if a lobby already exists
  export let gameInProgress = false;     // true if phase is 'play' / 'reveal' / 'ended'
  export let onJoin: (names: string[]) => void = () => {};
  export let onNewGame: () => void = () => {};

  // Hot-seat: two seats by default, one device.
  let names: string[] = ['Vincent', 'Anne-Laure'];

  function addSeat() { names = [...names, '']; }
  function removeSeat(i: number) {
    if (names.length <= 1) return;
    names = names.filter((_, j) => j !== i);
  }
  function submit() {
    const cleaned = names.map(n => n.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    onJoin(cleaned);
  }

  $: canSubmit = names.some(n => n.trim().length > 0);
</script>

<div class="max-w-lg mx-auto px-4 py-14 space-y-8 animate-slide-up">
  <div class="text-center space-y-3">
    <div class="inline-flex w-14 h-14 rounded-2xl bg-neon text-night-900 font-display font-bold grid place-items-center text-2xl shadow-[0_0_32px_-8px_#a3e635]">D</div>
    <h1 class="text-4xl sm:text-5xl font-display">Duel</h1>
    <p class="text-mist-500 max-w-sm mx-auto">
      Scrabble duplicate — même tirage, même plateau. Plusieurs joueurs peuvent partager un seul appareil
      (vous passerez le clavier à chaque tour).
    </p>
  </div>

  <section class="panel p-5 space-y-4">
    {#if gameInProgress}
      <div class="text-center space-y-3">
        <p class="text-sm text-rose-glow">Une partie est déjà en cours.</p>
        <p class="text-xs text-mist-500">Attendez la fin — ou forcez une nouvelle partie (réinitialise l'état partagé).</p>
        <button class="btn-ghost text-sm" on:click={onNewGame}>↻ Nouvelle partie</button>
      </div>
    {:else}
      {#if activePlayerCount > 0}
        <p class="text-xs font-mono uppercase tracking-wider text-mist-500 text-center">
          {activePlayerCount} joueur{activePlayerCount > 1 ? 's' : ''} déjà dans le salon — ajoute les tiens
        </p>
      {:else}
        <p class="text-xs font-mono uppercase tracking-wider text-mist-500 text-center">
          Joueurs sur cet appareil
        </p>
      {/if}

      <div class="space-y-2">
        {#each names as _, i (i)}
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={names[i]}
              maxlength="18"
              placeholder={`Joueur ${i + 1}`}
              class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-display text-lg
                     focus:outline-none focus:border-neon"
              on:keydown={(e) => { if (e.key === 'Enter') submit(); }}
            />
            {#if names.length > 1}
              <button class="btn-ghost !px-3" on:click={() => removeSeat(i)} aria-label="Retirer ce joueur">✕</button>
            {/if}
          </div>
        {/each}
        <button class="btn-ghost w-full text-sm" on:click={addSeat}>+ Ajouter un joueur</button>
      </div>

      <button
        class="btn-primary w-full text-base"
        on:click={submit}
        disabled={!canSubmit || dictLoading}
      >
        {dictLoading ? 'Chargement du dictionnaire…' : (activePlayerCount > 0 ? 'Rejoindre' : 'Créer la partie')}
      </button>
    {/if}
  </section>
</div>
