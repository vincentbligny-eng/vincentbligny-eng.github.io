<script lang="ts">
  import { LETTER_VALUE } from '../engine/constants';

  export let letter: string;
  export let blank = false;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let state: 'fixed' | 'pending' | 'ghost' | 'rack' = 'rack';
  export let selected = false;

  $: value = blank ? 0 : (LETTER_VALUE[letter] ?? 0);
  $: display = letter === '?' ? '' : letter;

  const dims = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  };
</script>

<div
  class="relative inline-grid place-items-center rounded-md font-display font-bold
         shadow-tile select-none transition
         {dims[size]}
         {state === 'ghost' ? 'bg-ember/30 text-ember-glow ring-1 ring-ember/60' : ''}
         {state === 'pending' ? 'bg-ember text-night-900 ring-2 ring-ember-glow scale-[1.04]' : ''}
         {state === 'fixed' ? 'bg-tile-cream text-night-900' : ''}
         {state === 'rack' ? 'bg-tile-cream text-night-900 hover:-translate-y-0.5 cursor-grab' : ''}
         {selected ? 'ring-2 ring-neon scale-105 z-10' : ''}
         {blank ? 'italic' : ''}"
  role="button"
  tabindex="0"
  on:click
  on:keydown
>
  <span>{display}</span>
  {#if letter !== '?' && size !== 'sm'}
    <span class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">{value}</span>
  {/if}
</div>
