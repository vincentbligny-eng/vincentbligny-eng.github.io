<script lang="ts">
  export let trigger = 0;

  interface Particle {
    id: number;
    x: number;       // vw
    color: string;
    delay: number;
    duration: number;
    rot: number;
    drift: number;
    shape: 'square' | 'circle' | 'tri';
  }

  const COLORS = ['#a3e635', '#fb923c', '#fbbf24', '#f472b6', '#38bdf8', '#f87171', '#c084fc'];
  let particles: Particle[] = [];

  let lastTrigger = 0;
  $: if (trigger > lastTrigger) {
    lastTrigger = trigger;
    burst();
  }

  function burst() {
    const next: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      next.push({
        id: Date.now() + i,
        x: 35 + Math.random() * 30,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 150,
        duration: 1600 + Math.random() * 900,
        rot: (Math.random() - 0.5) * 720,
        drift: (Math.random() - 0.5) * 70,
        shape: (['square', 'circle', 'tri'] as const)[Math.floor(Math.random() * 3)],
      });
    }
    particles = next;
    setTimeout(() => { particles = []; }, 3000);
  }
</script>

<div class="pointer-events-none fixed inset-0 overflow-hidden z-50" aria-hidden="true">
  {#each particles as p (p.id)}
    <span
      class="confetti-piece {p.shape}"
      style="
        left: {p.x}vw;
        background: {p.color};
        animation-delay: {p.delay}ms;
        animation-duration: {p.duration}ms;
        --drift: {p.drift}vw;
        --rot: {p.rot}deg;
      "
    ></span>
  {/each}
</div>

<style>
  .confetti-piece {
    position: absolute;
    top: -20px;
    width: 10px;
    height: 14px;
    transform: translateY(0) rotate(0);
    animation-name: fall;
    animation-timing-function: cubic-bezier(0.25, 0.8, 0.3, 1);
    animation-fill-mode: forwards;
  }
  .confetti-piece.circle { border-radius: 50%; width: 10px; height: 10px; }
  .confetti-piece.tri {
    background: transparent !important;
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 12px solid currentColor;
  }
  @keyframes fall {
    0%   { transform: translate3d(0, -30px, 0) rotate(0); opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translate3d(var(--drift), 105vh, 0) rotate(var(--rot)); opacity: 0; }
  }
</style>
