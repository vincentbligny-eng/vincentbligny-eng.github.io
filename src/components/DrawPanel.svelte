<script lang="ts">
  import { DISTRIBUTION, RACK_SIZE } from '../engine/constants';

  export let bag: string[];
  export let reserved: string[];
  export let onChange: (r: string[]) => void = () => {};

  // Count remaining tiles per letter.
  $: remaining = (() => {
    const c: Record<string, number> = {};
    for (const l of bag) c[l] = (c[l] ?? 0) + 1;
    return c;
  })();

  $: reservedCounts = (() => {
    const c: Record<string, number> = {};
    for (const l of reserved) c[l] = (c[l] ?? 0) + 1;
    return c;
  })();

  const letters = Object.keys(DISTRIBUTION);

  function add(letter: string) {
    if (reserved.length >= RACK_SIZE) return;
    const used = reservedCounts[letter] ?? 0;
    if (used >= (remaining[letter] ?? 0)) return;
    onChange([...reserved, letter]);
  }
  function remove(letter: string) {
    const i = reserved.lastIndexOf(letter);
    if (i === -1) return;
    const next = [...reserved];
    next.splice(i, 1);
    onChange(next);
  }
  function clear() { onChange([]); }
</script>

<section class="panel p-5 space-y-4">
  <header class="flex items-center justify-between">
    <div>
      <h3 class="text-lg">Influencer le prochain tirage</h3>
      <p class="text-xs text-mist-500">Réservez jusqu'à 7 lettres qui apparaîtront dans votre rack au prochain coup.</p>
    </div>
    {#if reserved.length > 0}
      <button class="btn-ghost !py-1 !px-2 text-xs" on:click={clear}>Réinitialiser</button>
    {/if}
  </header>

  <div class="flex flex-wrap gap-2">
    {#each reserved as l, i}
      <button
        type="button"
        on:click={() => { const n=[...reserved]; n.splice(i,1); onChange(n); }}
        class="chip bg-ember/20 text-ember-glow border border-ember/30 !px-2 !py-1 font-display
               hover:bg-ember/30 !text-sm"
        title="Cliquer pour retirer"
      >{l === '?' ? '□' : l}</button>
    {/each}
    {#if reserved.length === 0}
      <span class="text-xs text-mist-500">(aléatoire)</span>
    {/if}
  </div>

  <div>
    <p class="text-xs text-mist-500 mb-2 uppercase tracking-wider font-mono">
      Sac · {bag.length} lettre{bag.length > 1 ? 's' : ''} · cliquez pour ajouter
    </p>
    <div class="grid gap-1" style="grid-template-columns: repeat(9, minmax(0, 1fr))">
      {#each letters as l}
        {@const used = reservedCounts[l] ?? 0}
        {@const left = (remaining[l] ?? 0) - used}
        <button
          type="button"
          disabled={left <= 0 || reserved.length >= RACK_SIZE}
          on:click={() => add(l)}
          class="relative rounded-md border border-white/5 p-1 flex flex-col items-center
                 transition
                 {left > 0 && reserved.length < RACK_SIZE
                   ? 'bg-white/5 hover:bg-neon/10 hover:border-neon/40'
                   : 'bg-white/[0.02] opacity-40'}"
          title={l === '?' ? 'Joker' : l}
        >
          <span class="font-display text-sm leading-none">{l === '?' ? '□' : l}</span>
          <span class="text-[9px] font-mono text-mist-500">{left}</span>
        </button>
      {/each}
    </div>
  </div>
</section>
