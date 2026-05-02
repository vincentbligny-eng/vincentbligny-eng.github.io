<script lang="ts">
  export let message: { id: number; emoji: string; text: string; title: string } | null = null;

  let current: typeof message = null;
  let showing = false;
  let hideTimer: ReturnType<typeof setTimeout>;

  $: if (message && message.id !== current?.id) {
    clearTimeout(hideTimer);
    current = message;
    showing = true;
    hideTimer = setTimeout(() => { showing = false; }, 2400);
  }
</script>

<div
  class="fixed top-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300
         {showing ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6 pointer-events-none'}"
>
  {#if current}
    <div class="panel px-5 py-3 flex items-center gap-3 min-w-[260px]">
      <span class="text-3xl">{current.emoji}</span>
      <div>
        <p class="font-display text-lg leading-tight">{current.title}</p>
        <p class="text-xs text-mist-500">{current.text}</p>
      </div>
    </div>
  {/if}
</div>
