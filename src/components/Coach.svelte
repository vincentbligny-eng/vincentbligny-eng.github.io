<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { COACH_QUOTES } from '../lib/easter-eggs';

  let quote = COACH_QUOTES[0];
  let idx = 0;
  let waving = false;
  let timer: ReturnType<typeof setInterval>;

  function next() {
    idx = (idx + 1) % COACH_QUOTES.length;
    quote = COACH_QUOTES[idx];
    waving = true;
    setTimeout(() => waving = false, 700);
  }

  onMount(() => {
    idx = Math.floor(Math.random() * COACH_QUOTES.length);
    quote = COACH_QUOTES[idx];
    timer = setInterval(next, 22000);
  });
  onDestroy(() => clearInterval(timer));
</script>

<button
  class="fixed top-20 right-4 md:top-auto md:bottom-4 md:right-4 z-30 flex items-end gap-2 group"
  on:click={next}
  title="Cliquer pour un autre conseil"
>
  <div class="max-w-[220px] panel !rounded-2xl !rounded-br-sm px-3 py-2 text-xs text-mist-100
              shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]
              opacity-0 group-hover:opacity-100 transition duration-300
              translate-y-1 group-hover:translate-y-0">
    {quote}
  </div>
  <div class="w-12 h-12 rounded-full bg-neon text-night-900 grid place-items-center text-2xl
              shadow-[0_0_30px_-6px_#a3e635] {waving ? 'animate-pop-in' : ''}
              hover:scale-110 transition">
    🦉
  </div>
</button>
