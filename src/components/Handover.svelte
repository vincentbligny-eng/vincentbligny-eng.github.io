<script lang="ts">
  export let name: string;
  export let color: string = '#a3e635';
  export let onContinue: () => void = () => {};

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onContinue(); }
  }
</script>

<svelte:window on:keydown={handleKey} />

<div
  class="fixed inset-0 z-40 grid place-items-center bg-night-900/95 backdrop-blur-sm animate-pop-in"
  role="dialog"
  aria-modal="true"
  aria-label="Passer le contrôle au joueur suivant"
>
  <div class="text-center space-y-6 px-6">
    <p class="text-xs uppercase tracking-[0.2em] text-mist-500 font-mono">Au tour de</p>
    <h2
      class="font-display font-bold text-6xl sm:text-7xl"
      style="color: {color}; text-shadow: 0 0 40px {color}80;"
    >
      {name}
    </h2>
    <p class="text-mist-500 text-sm max-w-sm mx-auto">
      Passez le clavier. Votre adversaire ne doit pas voir votre futur coup.
    </p>
    <button
      class="btn-primary text-base"
      on:click={onContinue}
    >
      J'y vais ! <span class="ml-2 opacity-60 text-xs font-mono">⏎</span>
    </button>
  </div>
</div>
