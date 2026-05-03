<script lang="ts">
  import { BOARD_SIZE, PREMIUM_GRID, LETTER_VALUE } from '../engine/constants';
  import type { Board, Placement, Direction } from '../engine/types';

  export let board: Board;
  export let pending: Placement[] = [];
  export let ghost: Placement[] = [];
  export let cursor: { row: number; col: number; dir: Direction } | null = null;
  export let onCellClick: (r: number, c: number) => void = () => {};
  export let mode3d = false;

  const CENTER = Math.floor(BOARD_SIZE / 2);

  function premiumClass(r: number, c: number): string {
    const p = PREMIUM_GRID[r][c];
    if (r === CENTER && c === CENTER) return 'bg-prem-center/85 text-night-900';
    switch (p) {
      case 'DL': return 'bg-prem-dl/35 text-sky-100 ring-1 ring-inset ring-prem-dl/40';
      case 'TL': return 'bg-prem-tl/70 text-blue-50  ring-1 ring-inset ring-blue-300/35';
      case 'DW': return 'bg-prem-dw/35 text-pink-50  ring-1 ring-inset ring-prem-dw/45';
      case 'TW': return 'bg-prem-tw/75 text-rose-50  ring-1 ring-inset ring-red-300/40 font-bold';
      default:   return 'bg-night-600/40';
    }
  }
  function premiumLabel(r: number, c: number): string {
    if (r === CENTER && c === CENTER) return '★';
    const p = PREMIUM_GRID[r][c];
    switch (p) {
      case 'DL': return 'L×2';
      case 'TL': return 'L×3';
      case 'DW': return 'M×2';
      case 'TW': return 'M×3';
      default:   return '';
    }
  }
  function tileFaceClass(kind: string): string {
    if (kind === 'pending') return 'tile-face2d-pending text-night-900';
    if (kind === 'ghost')   return 'tile-face2d-ghost text-ember-glow';
    return 'tile-face2d-fixed text-night-900';
  }

  $: pendingMap = new Map(pending.map(p => [`${p.row},${p.col}`, p]));
  $: ghostMap   = new Map(ghost.map(p   => [`${p.row},${p.col}`, p]));

  // Mouse parallax tilt in 3D mode
  let tiltX = 22;
  let tiltY = -6;
  let rest = { x: 22, y: -6 };
  let sceneEl: HTMLDivElement | undefined;

  function onMove(e: MouseEvent) {
    if (!mode3d || !sceneEl) return;
    const r = sceneEl.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;   // -0.5 .. 0.5
    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    tiltX = rest.x + dy * 8;     // tilt more forward as mouse moves down
    tiltY = rest.y - dx * 12;    // yaw left/right with mouse x
  }
  function onLeave() {
    tiltX = rest.x;
    tiltY = rest.y;
  }
</script>

<div class="panel p-3 sm:p-5 inline-block {mode3d ? 'board-shell-3d' : ''}">
  <div
    bind:this={sceneEl}
    on:mousemove={onMove}
    on:mouseleave={onLeave}
    class={mode3d ? 'scene-3d' : ''}
  >
    <div
      class={mode3d ? 'tilt-3d' : ''}
      style={mode3d ? `transform: rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotateZ(-2deg);` : ''}
    >
      {#if mode3d}
        <!-- Wooden tray frame -->
        <div class="tray-3d">
          <div class="tray-top-3d"></div>
          <div class="tray-front-3d"></div>
          <div class="tray-right-3d"></div>
        </div>
      {/if}

      <div
        class="grid gap-[2px] rounded-lg p-[2px] relative
               {mode3d ? 'board-grid-3d' : 'bg-night-900/60'}"
        style={`grid-template-columns: repeat(${BOARD_SIZE}, minmax(0, 1fr)); width: min(95vmin, 62vh, 640px); ${mode3d ? 'transform-style: preserve-3d;' : ''}`}
      >
        {#each board as row, r}
          {#each row as cell, c}
            {@const key = `${r},${c}`}
            {@const p = pendingMap.get(key)}
            {@const g = ghostMap.get(key)}
            {@const occupant = cell.letter
              ? { letter: cell.letter, blank: cell.blank, kind: 'fixed' }
              : p ? { letter: p.letter, blank: p.blank, kind: 'pending' }
              : g ? { letter: g.letter, blank: g.blank, kind: 'ghost' }
              : null}
            {@const isCursor = cursor && cursor.row === r && cursor.col === c}
            <button
              type="button"
              on:click={() => onCellClick(r, c)}
              class="aspect-square rounded-[5px] flex items-center justify-center text-[10px] uppercase
                     tracking-widest transition relative cell-3d
                     {occupant ? '' : premiumClass(r, c) + ' hover:brightness-125'}
                     {isCursor ? 'cursor-cell' : ''}"
              style={mode3d ? 'transform-style: preserve-3d;' : ''}
            >
              {#if occupant}
                {#if mode3d}
                  <div class="tile-3d {tileFaceClass(occupant.kind)}
                              {occupant.kind === 'pending' ? 'tile-drop' : ''}">
                    <div class="tile-top-3d">
                      <span class="tile-letter">{occupant.letter === '?' ? '' : occupant.letter}</span>
                      {#if occupant.letter !== '?' && !occupant.blank}
                        <span class="tile-value">{LETTER_VALUE[occupant.letter] ?? 0}</span>
                      {/if}
                    </div>
                    <div class="tile-front-3d"></div>
                    <div class="tile-right-3d"></div>
                  </div>
                {:else}
                  <div class="w-full h-full rounded-[5px] flex items-center justify-center relative
                              {tileFaceClass(occupant.kind)}
                              {occupant.kind === 'pending' ? 'animate-pop-in' : ''}">
                    <span class="tile-letter font-display font-bold">{occupant.letter === '?' ? '' : occupant.letter}</span>
                    {#if occupant.letter !== '?' && !occupant.blank}
                      <span class="tile-value">{LETTER_VALUE[occupant.letter] ?? 0}</span>
                    {/if}
                  </div>
                {/if}
              {:else}
                <span class="opacity-90 relative z-[1] font-mono font-semibold text-[10px] tracking-tight">{premiumLabel(r, c)}</span>
              {/if}

              {#if isCursor && !occupant}
                <span class="cursor-indicator" aria-hidden="true">
                  {cursor.dir === 'H' ? '→' : '↓'}
                </span>
              {/if}
            </button>
          {/each}
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .board-shell-3d {
    background:
      radial-gradient(ellipse at 50% 0%, rgba(163,230,53,0.05), transparent 60%),
      linear-gradient(180deg, #0b1018 0%, #07090f 100%);
  }

  .scene-3d {
    perspective: 1600px;
    perspective-origin: 50% 25%;
  }

  .tilt-3d {
    transform-style: preserve-3d;
    transition: transform 0.5s cubic-bezier(.2,.9,.3,1.2);
    position: relative;
    animation: bob 8s ease-in-out infinite;
  }
  @keyframes bob {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-2px); }
  }

  /* Wooden frame around the grid */
  .tray-3d {
    position: absolute;
    inset: -16px;
    transform-style: preserve-3d;
    pointer-events: none;
    z-index: -1;
  }
  .tray-top-3d {
    position: absolute;
    inset: 0;
    border-radius: 16px;
    background:
      repeating-linear-gradient(87deg,
        rgba(255,255,255,0.04) 0 1px,
        transparent 1px 3px,
        rgba(0,0,0,0.08) 3px 4px,
        transparent 4px 9px),
      linear-gradient(160deg, #4a3423 0%, #261510 55%, #3a2618 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.06),
      inset 0 2px 0 rgba(255,255,255,0.08),
      0 50px 80px -20px rgba(0,0,0,0.7);
    transform: translateZ(-4px);
  }
  .tray-front-3d, .tray-right-3d {
    position: absolute;
    background: linear-gradient(180deg, #2c1b10, #120a06);
    backface-visibility: hidden;
  }
  .tray-front-3d {
    left: 0; right: 0;
    top: 100%;
    height: 14px;
    transform-origin: top center;
    transform: rotateX(-90deg);
  }
  .tray-right-3d {
    top: 0; bottom: 0;
    left: 100%;
    width: 14px;
    transform-origin: left center;
    transform: rotateY(90deg);
  }

  .board-grid-3d {
    background:
      repeating-linear-gradient(45deg,
        rgba(0,0,0,0.08) 0 1px, transparent 1px 12px),
      linear-gradient(180deg, #101522 0%, #070a11 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.04),
      inset 0 2px 8px rgba(0,0,0,0.6);
  }

  /* 3D tile */
  .tile-3d {
    position: absolute;
    inset: 1px;
    transform-style: preserve-3d;
    transform: translateZ(10px);
    border-radius: 4px;
    animation: none;
  }
  .tile-drop {
    animation: drop 0.35s cubic-bezier(.2,.8,.3,1.3) both;
  }
  @keyframes drop {
    0%   { transform: translateZ(90px) scale(1.15); opacity: 0; }
    60%  { transform: translateZ(6px)  scale(0.97); opacity: 1; }
    100% { transform: translateZ(10px) scale(1);    opacity: 1; }
  }

  .tile-top-3d {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    backface-visibility: hidden;
    background: inherit;
    color: inherit;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.7),
      inset 0 -1px 0 rgba(0,0,0,0.15),
      inset 0 0 0 1px rgba(0,0,0,0.08);
    /* subtle wood grain */
    background-image:
      repeating-linear-gradient(92deg,
        rgba(0,0,0,0.03) 0 1px,
        transparent 1px 3px),
      linear-gradient(180deg, #fbf0d2 0%, #f0d9a7 100%);
  }
  .tile-front-3d, .tile-right-3d {
    position: absolute;
    backface-visibility: hidden;
  }
  .tile-front-3d {
    left: 0; right: 0;
    height: 10px;
    top: 100%;
    transform-origin: top center;
    transform: rotateX(-90deg);
    background: linear-gradient(180deg, #d4b88b 0%, #8a6837 100%);
    border-bottom-left-radius: 3px;
    border-bottom-right-radius: 3px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  .tile-right-3d {
    top: 0; bottom: 0;
    width: 10px;
    left: 100%;
    transform-origin: left center;
    transform: rotateY(90deg);
    background: linear-gradient(90deg, #c9a865 0%, #6e5128 100%);
  }

  /* 2D tile faces — gradient + bevel for a tactile feel. */
  .tile-face2d-fixed {
    background: linear-gradient(180deg, #fdf3da 0%, #f0deb1 55%, #d8c089 100%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.55),
      inset 0 -3px 0 rgba(0,0,0,0.16),
      0 1px 2px rgba(0,0,0,0.4);
    position: relative;
  }
  .tile-face2d-fixed::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 45%);
    pointer-events: none;
  }
  .tile-face2d-pending {
    background: linear-gradient(180deg, #ffd194 0%, #fb923c 60%, #d97706 100%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.55),
      inset 0 -3px 0 rgba(0,0,0,0.22),
      0 0 0 2px #fdba74,
      0 0 22px -4px #fb923cc0,
      0 2px 4px rgba(0,0,0,0.5);
    position: relative;
  }
  .tile-face2d-pending::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 45%);
    pointer-events: none;
  }
  .tile-face2d-ghost {
    background: linear-gradient(180deg, rgba(251,146,60,0.4), rgba(251,146,60,0.18));
    box-shadow: inset 0 0 0 1px rgba(251,146,60,0.55);
  }

  .tile-letter {
    font-family: "Space Grotesk", ui-sans-serif, sans-serif;
    font-weight: 800;
    font-size: clamp(1rem, 3.4vmin, 1.55rem);
    line-height: 1;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 0 rgba(255,255,255,0.55), 0 -1px 0 rgba(0,0,0,0.2);
  }
  .tile-value {
    position: absolute;
    right: 3px;
    bottom: 1px;
    font-size: clamp(0.55rem, 1.6vmin, 0.7rem);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-weight: 600;
    opacity: 0.72;
  }

  /* Cursor */
  .cursor-cell {
    box-shadow: 0 0 0 2px #a3e635, 0 0 18px -2px #a3e635;
    z-index: 2;
  }
  .cursor-indicator {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #a3e635;
    font-size: 22px;
    font-weight: 700;
    animation: pulse 1.1s ease-in-out infinite;
    pointer-events: none;
    filter: drop-shadow(0 0 8px rgba(163,230,53,0.6));
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.55; transform: scale(0.9); }
    50%      { opacity: 1;    transform: scale(1.1); }
  }
</style>
