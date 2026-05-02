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
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-14 h-14 text-3xl',
  };
</script>

<div
  class="tile-face relative inline-grid place-items-center rounded-lg font-display font-bold
         select-none transition
         {dims[size]}
         {state === 'ghost' ? 'tile-face--ghost' : ''}
         {state === 'pending' ? 'tile-face--pending' : ''}
         {state === 'fixed' ? 'tile-face--fixed' : ''}
         {state === 'rack' ? 'tile-face--rack hover:-translate-y-1 cursor-grab' : ''}
         {selected ? 'tile-face--selected scale-110 z-10' : ''}
         {blank ? 'italic' : ''}"
  role="button"
  tabindex="0"
  on:click
  on:keydown
>
  <span class="letter">{display}</span>
  {#if letter !== '?' && size !== 'sm'}
    <span class="value">{value}</span>
  {/if}
</div>

<style>
  .tile-face {
    position: relative;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.55),
      inset 0 -3px 0 rgba(0,0,0,0.18),
      0 2px 4px rgba(0,0,0,0.45),
      0 8px 18px -10px rgba(0,0,0,0.6);
  }
  .tile-face::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 45%);
    pointer-events: none;
  }
  .tile-face .letter {
    position: relative;
    z-index: 1;
    text-shadow: 0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 rgba(0,0,0,0.18);
    letter-spacing: 0.02em;
  }
  .tile-face .value {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: 11px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-weight: 600;
    opacity: 0.7;
    z-index: 1;
  }

  .tile-face--rack, .tile-face--fixed {
    background: linear-gradient(180deg, #fdf3da 0%, #f0deb1 55%, #d8c089 100%);
    color: #1a1a1f;
  }
  .tile-face--pending {
    background: linear-gradient(180deg, #ffd194 0%, #fb923c 60%, #d97706 100%);
    color: #07080c;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.55),
      inset 0 -3px 0 rgba(0,0,0,0.22),
      0 0 0 2px #fdba74,
      0 0 22px -4px #fb923cb0,
      0 4px 10px rgba(0,0,0,0.5);
    transform: scale(1.04);
  }
  .tile-face--ghost {
    background: linear-gradient(180deg, rgba(251,146,60,0.35), rgba(251,146,60,0.18));
    color: #fdba74;
    box-shadow: inset 0 0 0 1px rgba(251,146,60,0.55);
  }
  .tile-face--selected {
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.55),
      inset 0 -3px 0 rgba(0,0,0,0.18),
      0 0 0 2px #a3e635,
      0 0 28px -4px #a3e635c0,
      0 6px 14px rgba(0,0,0,0.5);
  }
</style>
