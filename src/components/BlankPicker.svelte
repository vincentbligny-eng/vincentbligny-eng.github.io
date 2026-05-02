<script lang="ts">
  export let open = false;
  export let onPick: (letter: string) => void = () => {};
  export let onCancel: () => void = () => {};

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  function handleKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    const up = e.key.toUpperCase();
    if (/^[A-Z]$/.test(up)) { e.preventDefault(); onPick(up); }
  }
</script>

<svelte:window on:keydown={handleKey} />

{#if open}
  <div
    class="fixed inset-0 z-40 bg-night-900/80 backdrop-blur grid place-items-center animate-pop-in"
    on:click={onCancel}
    role="dialog"
    aria-modal="true"
  >
    <div class="panel p-6 max-w-md" on:click|stopPropagation on:keydown|stopPropagation>
      <h3 class="text-lg font-display mb-1">Joker</h3>
      <p class="text-xs text-mist-500 mb-4">Choisissez la lettre représentée — ou tapez-la.</p>
      <div class="grid grid-cols-7 sm:grid-cols-9 gap-1.5">
        {#each letters as l}
          <button
            type="button"
            class="aspect-square rounded-md bg-tile-cream/90 text-night-900 font-display font-bold text-lg
                   hover:bg-neon hover:scale-110 hover:-translate-y-0.5 transition shadow-tile"
            on:click={() => onPick(l)}
          >{l}</button>
        {/each}
      </div>
      <button class="mt-4 btn-ghost text-xs w-full" on:click={onCancel}>Annuler</button>
    </div>
  </div>
{/if}
