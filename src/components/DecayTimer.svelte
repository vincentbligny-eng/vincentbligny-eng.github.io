<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    decayMultiplierFor,
    DECAY_GRACE_MS, DECAY_DOOM_MS, DECAY_WINDOW_MS,
  } from '../lib/session';

  // The decay clock — a slowly progressing, ominous bar.
  export let firstSubmittedAt: number | null;
  export let activeColor: string = '#a3e635';
  export let compact: boolean = false;
  // "me" = unsubmitted local player who still feels the pressure.
  // "spectator" = already submitted, watching others bleed.
  export let mode: 'me' | 'spectator' = 'me';

  let now = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // 100 ms cadence — smooth bar drift without being wasteful.
    timer = setInterval(() => { now = Date.now(); }, 100);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  $: elapsedMs = firstSubmittedAt == null ? 0 : Math.max(0, now - firstSubmittedAt);
  $: multiplier = decayMultiplierFor(elapsedMs);
  $: pctLabel = Math.round(multiplier * 100);

  // Phase: grace (full score) → doom (decaying) → expired.
  $: phase = elapsedMs < DECAY_GRACE_MS ? 'grace'
           : elapsedMs < DECAY_DOOM_MS  ? 'doom'
           : 'expired';

  // Grace progress (0..1 of the grace window).
  $: graceProgress = Math.min(1, elapsedMs / DECAY_GRACE_MS);

  // Time readouts.
  $: seconds = Math.floor(elapsedMs / 1000);
  $: mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  $: ss = String(seconds % 60).padStart(2, '0');
  $: msToDecay = Math.max(0, DECAY_GRACE_MS - elapsedMs);
  $: msToZero  = Math.max(0, DECAY_DOOM_MS - elapsedMs);

  // Colors: green during grace (with a hint of warning near the end),
  // sliding into amber and then a deep blood-red as the multiplier drops.
  $: hue = phase === 'grace'
    ? 110 - graceProgress * 30          // 110 → 80 (green slowly warming)
    : 60 - (1 - multiplier) * 60;       // 60 → 0 (amber → red)
  $: barColor = `hsl(${hue}, 90%, 55%)`;
  $: barGlow  = `hsl(${hue}, 95%, 60%)`;

  // Heartbeat: slow & steady in grace, accelerating wildly during doom.
  $: pulseMs = phase === 'grace'
    ? 1700 - graceProgress * 400        // 1.7s → 1.3s
    : Math.max(280, 1300 * multiplier + 280); // 1.6s → 0.28s

  // The bar fill: in grace, fills with elapsed/grace time; in doom, shows the
  // current multiplier (so it visibly *recedes* — the ominous part).
  $: barFill = phase === 'grace' ? graceProgress : multiplier;

  // Vignette/strobe intensity ramps up with doom.
  $: strobeOpacityHi = phase === 'grace' ? 0.45 : 0.95;
  $: strobeOpacityLo = phase === 'grace' ? 0.25 : 0.5;
</script>

{#if firstSubmittedAt != null}
  <div
    class="rounded-2xl border p-3 lg:p-4 relative overflow-hidden"
    class:compact
    class:doom={phase !== 'grace'}
    style={`
      border-color: ${barColor}55;
      background: linear-gradient(135deg, ${barColor}14 0%, transparent 70%), rgba(7,8,12,0.7);
      box-shadow: 0 0 30px -10px ${barGlow}, inset 0 0 30px -15px ${barGlow};
      --pulse: ${pulseMs}ms;
      --strobe-hi: ${strobeOpacityHi};
      --strobe-lo: ${strobeOpacityLo};
    `}
  >
    <!-- Heartbeat strobe behind everything -->
    <div class="strobe" style={`background: radial-gradient(circle at 50% 50%, ${barGlow}33, transparent 70%);`}></div>

    <div class="relative flex items-baseline justify-between gap-3 mb-2">
      <div class="min-w-0">
        <p class="text-[10px] font-mono uppercase tracking-[0.18em] text-mist-500">
          {#if phase === 'grace'}
            ⏱ Quelqu'un a joué — phase de grâce
          {:else if phase === 'doom'}
            {#if mode === 'me'}☠ Décompte fatal — vite !{:else}☠ Pression maximale{/if}
          {:else}
            🪦 Trop tard
          {/if}
        </p>
        <p
          class="font-display text-lg leading-tight truncate ominous-title"
          style={`color: ${barColor}; text-shadow: 0 0 14px ${barGlow}aa;`}
        >
          {#if mode === 'me'}
            Score × {pctLabel}%
          {:else}
            Décompte · {pctLabel}%
          {/if}
        </p>
      </div>
      <div class="text-right shrink-0">
        <p class="font-mono text-2xl leading-none tabular-nums" style={`color: ${barColor};`}>
          {mm}<span class="opacity-50">:</span>{ss}
        </p>
        <p class="text-[10px] font-mono text-mist-500 mt-0.5">
          {#if phase === 'grace'}
            Décrochage dans {Math.ceil(msToDecay / 1000)}s
          {:else if phase === 'doom'}
            Zéro dans {Math.ceil(msToZero / 1000)}s
          {:else}
            🪦 plus rien à perdre
          {/if}
        </p>
      </div>
    </div>

    <!-- The slow ominous bar -->
    <div class="relative h-3 rounded-full bg-white/5 border border-white/10 overflow-hidden">
      <!-- Background sweep showing the grace window vs the doom window -->
      <div class="absolute inset-y-0 left-0 bg-white/[0.03]"
           style={`width: ${(DECAY_GRACE_MS / DECAY_DOOM_MS) * 100}%;`}></div>
      <!-- Boundary tick at the 2 min mark -->
      <div class="absolute inset-y-0 w-px bg-white/30"
           style={`left: ${(DECAY_GRACE_MS / DECAY_DOOM_MS) * 100}%;`}></div>

      <!-- Active fill: in grace, fills forward; in doom, recedes from 100% to 0% -->
      <div
        class="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
        style={`
          width: ${barFill * 100}%;
          background: linear-gradient(90deg, hsl(110, 90%, 55%) 0%, hsl(60, 90%, 55%) 55%, hsl(0, 90%, 55%) 100%);
          box-shadow: 0 0 20px ${barGlow}cc, 0 0 6px ${barGlow};
          opacity: ${phase === 'expired' ? 0.15 : 1};
        `}
      ></div>

      <!-- Pulsing cursor head -->
      {#if phase !== 'expired'}
        <div
          class="cursor-dot"
          style={`
            left: calc(${barFill * 100}% - 6px);
            background: ${barColor};
            box-shadow: 0 0 14px ${barGlow}, 0 0 4px ${barGlow};
            animation-duration: ${pulseMs}ms;
          `}
        ></div>
      {/if}
    </div>

    <!-- Phase labels under the bar -->
    <div class="flex justify-between mt-1 px-0.5 text-[9px] font-mono text-mist-500 tabular-nums">
      <span class:active={phase === 'grace'}>0:00 · plein score</span>
      <span class:active={phase === 'grace'} class:past={phase !== 'grace'}>2:00 · décrochage</span>
      <span class:active={phase === 'doom'}>3:30 · ½</span>
      <span class:active={phase === 'expired'} class:past={phase === 'expired'}>5:00 · 0%</span>
    </div>

    {#if mode === 'me' && phase === 'doom' && multiplier < 0.6}
      <p class="relative mt-2 text-xs font-mono text-rose-glow ominous-warn">
        ⚠ Ton score fond — pose ces lettres !
      </p>
    {/if}
  </div>
{/if}

<style>
  .strobe {
    position: absolute;
    inset: 0;
    pointer-events: none;
    animation: pulseBg var(--pulse) ease-in-out infinite;
  }
  @keyframes pulseBg {
    0%, 100% { opacity: var(--strobe-lo, 0.3); }
    50%      { opacity: var(--strobe-hi, 0.85); }
  }
  .cursor-dot {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    animation: dotPulse var(--pulse) ease-in-out infinite;
  }
  @keyframes dotPulse {
    0%, 100% { transform: translateY(-50%) scale(1);   filter: brightness(1.0); }
    50%      { transform: translateY(-50%) scale(1.4); filter: brightness(1.7); }
  }
  .doom .ominous-title {
    animation: titleQuiver var(--pulse) ease-in-out infinite;
  }
  @keyframes titleQuiver {
    0%, 100% { letter-spacing: 0;       filter: brightness(1.0); }
    50%      { letter-spacing: 0.04em;  filter: brightness(1.25); }
  }
  .ominous-warn {
    animation: warnPulse calc(var(--pulse) / 1.2) ease-in-out infinite;
  }
  @keyframes warnPulse {
    0%, 100% { opacity: 0.7; }
    50%      { opacity: 1;   }
  }
  .active { color: #fff; }
  .past   { opacity: 0.4; text-decoration: line-through; }
  .compact { padding: 0.5rem 0.75rem; }
</style>
