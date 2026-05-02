<script lang="ts">
  import type { Move } from '../engine/types';
  import type { HintReport } from '../engine/hints';
  import { RANDOM_THOUGHTS } from '../lib/easter-eggs';

  // Kept for API compatibility with Game.svelte; we ignore the report and never apply.
  export let report: HintReport | null = null;
  export let loading = false;
  export let onHover: (m: Move | null) => void = () => {};
  export let onApply: (m: Move) => void = () => {};
  export let onAnalyze: () => void = () => {};

  // Suppress unused-export warnings without changing the public API.
  void report; void loading; void onHover; void onApply;

  let consultations = 0;
  let thought = '';
  let bubbleKey = 0;          // forces re-mount → re-runs the pop-in animation

  function pickThought(): string {
    if (RANDOM_THOUGHTS.length === 0) return '…';
    let next = RANDOM_THOUGHTS[Math.floor(Math.random() * RANDOM_THOUGHTS.length)];
    // Avoid the rare immediate repeat.
    if (next === thought && RANDOM_THOUGHTS.length > 1) {
      next = RANDOM_THOUGHTS[(RANDOM_THOUGHTS.indexOf(next) + 1) % RANDOM_THOUGHTS.length];
    }
    return next;
  }

  function consult() {
    thought = pickThought();
    consultations++;
    bubbleKey++;
    onAnalyze();              // still flips `usedHints` upstream → triggers the cheat badge
  }
</script>

<section class="panel p-5 space-y-4 oracle-panel">
  <header class="flex items-center justify-between gap-2">
    <div>
      <h3 class="text-lg flex items-center gap-2">🦉 <span>Conseil du jour</span></h3>
      <p class="text-xs text-mist-500 italic">…ou pas. On sait pas trop.</p>
    </div>
    <button class="btn-ghost !py-1.5 !px-3 text-xs whitespace-nowrap" on:click={consult}>
      {thought ? 'Encore !' : 'Demande conseil'}
    </button>
  </header>

  <div class="bubble-stage">
    {#if !thought}
      <p class="text-sm text-mist-500 italic">
        Le hibou n'a pas encore parlé. Cliquez si vous osez — il sera prévenu.
      </p>
    {:else}
      {#key bubbleKey}
        <div class="comic-bubble animate-pop-in">
          <p class="bubble-text">{thought}</p>
          <span class="bubble-tail" aria-hidden="true"></span>
          <span class="bubble-tail-stroke" aria-hidden="true"></span>
        </div>
      {/key}
      <p class="text-[10px] font-mono uppercase tracking-wider text-mist-500 mt-1 text-right">
        consultation #{consultations} · 👀 noté
      </p>
    {/if}
  </div>
</section>

<style>
  .oracle-panel {
    background:
      radial-gradient(ellipse at top right, rgba(163,230,53,0.06), transparent 60%),
      linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
  }
  .bubble-stage {
    position: relative;
    min-height: 110px;
    padding-bottom: 18px;
  }

  /* Comic speech bubble with a tail. The tail is two stacked elements:
     a coloured triangle on top of a slightly larger black one for the
     stroke effect. */
  .comic-bubble {
    position: relative;
    background: #fdf3da;
    color: #1a1a1f;
    border: 2px solid #07080c;
    border-radius: 22px;
    padding: 14px 18px 16px 18px;
    font-family: "Space Grotesk", ui-sans-serif, sans-serif;
    font-weight: 600;
    font-size: 15px;
    line-height: 1.35;
    box-shadow:
      4px 4px 0 #07080c,
      0 14px 30px -12px rgba(0,0,0,0.6);
    transform-origin: bottom right;
  }
  .bubble-text {
    margin: 0;
    /* Slight italic for a hand-drawn feel. */
    font-style: italic;
  }
  /* Tail: knock-out triangle pointing toward the bottom-right (the owl). */
  .bubble-tail-stroke {
    position: absolute;
    right: 24px;
    bottom: -16px;
    width: 0; height: 0;
    border-left: 14px solid transparent;
    border-right: 0 solid transparent;
    border-top: 18px solid #07080c;
  }
  .bubble-tail {
    position: absolute;
    right: 27px;
    bottom: -10px;
    width: 0; height: 0;
    border-left: 10px solid transparent;
    border-right: 0 solid transparent;
    border-top: 12px solid #fdf3da;
    z-index: 1;
  }
</style>
