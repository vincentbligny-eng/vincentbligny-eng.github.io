<script lang="ts">
  import type { RackTile } from '../engine/types';
  import Tile from './Tile.svelte';

  export let rack: RackTile[];
  export let selectedId: string | null = null;
  export let pendingIds: Set<string> = new Set();
  export let onSelect: (id: string | null) => void = () => {};
  export let onShuffle: () => void = () => {};
</script>

<div class="panel px-4 py-3 flex items-center gap-3">
  <div class="flex-1 flex gap-1.5 sm:gap-2 justify-center flex-wrap">
    {#each rack as t (t.id)}
      {#if !pendingIds.has(t.id)}
        <button type="button" on:click={() => onSelect(selectedId === t.id ? null : t.id)}>
          <Tile
            letter={t.letter}
            blank={t.letter === '?'}
            size="md"
            state="rack"
            selected={selectedId === t.id}
          />
        </button>
      {:else}
        <div class="w-10 h-10 rounded-md border border-dashed border-white/10"></div>
      {/if}
    {/each}
  </div>
  <button class="btn-ghost !py-2 !px-3 text-xs" on:click={onShuffle} title="Mélanger">
    ⇄
  </button>
</div>
