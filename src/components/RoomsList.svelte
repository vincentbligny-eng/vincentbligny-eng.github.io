<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listRooms, type RoomSummary, type SupabaseConfig, setRoomInUrl } from '../lib/supabase';

  export let config: SupabaseConfig;
  export let currentRoomId: string | null = null;
  export let onCreate: () => void = () => {};

  let rooms: RoomSummary[] = [];
  let loading = true;
  let error: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      rooms = await listRooms(config);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Erreur de chargement';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    refresh();
    // Cheap polling — Realtime here would require subscribing to the whole table.
    timer = setInterval(refresh, 5000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  function visit(id: string) {
    if (id === currentRoomId) return;
    setRoomInUrl(id);
    window.location.reload();
  }

  function phaseLabel(p: RoomSummary['phase']): string {
    switch (p) {
      case 'lobby':  return 'Salon ouvert';
      case 'play':   return 'En cours';
      case 'reveal': return 'Résolution';
      case 'ended':  return 'Terminée';
    }
  }

  function phaseTone(p: RoomSummary['phase']): string {
    switch (p) {
      case 'lobby':  return 'text-neon-glow border-neon/30 bg-neon/10';
      case 'play':   return 'text-amber-300 border-amber-300/30 bg-amber-300/10';
      case 'reveal': return 'text-sky-300 border-sky-300/30 bg-sky-300/10';
      case 'ended':  return 'text-mist-500 border-white/10 bg-white/5';
    }
  }

  function relTime(iso: string): string {
    const t = new Date(iso).getTime();
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60)   return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60)   return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24)     return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}j`;
  }
</script>

<section class="panel p-4 space-y-3">
  <header class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="text-xs uppercase tracking-[0.18em] text-mist-500 font-mono">Salons publics</p>
      <h3 class="font-display text-base">Rejoindre une partie en direct</h3>
    </div>
    <div class="flex gap-2 shrink-0">
      <button class="btn-ghost !px-3 !py-1.5 text-xs" on:click={refresh} title="Rafraîchir">↻</button>
      <button class="btn-primary !px-3 !py-1.5 text-xs" on:click={onCreate}>+ Nouvelle</button>
    </div>
  </header>

  {#if loading && rooms.length === 0}
    <p class="text-xs text-mist-500 italic">Chargement…</p>
  {:else if error}
    <p class="text-xs text-rose-glow">⚠ {error}</p>
  {:else if rooms.length === 0}
    <p class="text-xs text-mist-500 italic">
      Aucun salon en ligne pour le moment. Crée-en un et partage le lien.
    </p>
  {:else}
    <ul class="space-y-1.5 max-h-72 overflow-auto pr-1">
      {#each rooms as r (r.roomId)}
        {@const isCurrent = r.roomId === currentRoomId}
        <li>
          <button
            class="w-full text-left rounded-xl border px-3 py-2 transition flex items-center gap-3
                   {isCurrent ? 'border-neon/40 bg-neon/5' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'}"
            on:click={() => visit(r.roomId)}
          >
            <span class="font-mono text-xs text-mist-500 shrink-0 w-16 truncate">{r.roomId}</span>
            <span class="flex-1 min-w-0">
              {#if r.players.length === 0}
                <span class="text-xs text-mist-500 italic">vide</span>
              {:else}
                <span class="flex items-center gap-1.5 flex-wrap">
                  {#each r.players as p}
                    <span class="inline-flex items-center gap-1 text-xs font-display max-w-[8rem] truncate"
                          style="color: {p.color};">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {p.color};"></span>
                      {p.name}
                    </span>
                  {/each}
                </span>
              {/if}
              <span class="block text-[10px] font-mono text-mist-500 mt-0.5 truncate">
                manche {r.turn} · ⏱ {relTime(r.updatedAt)}
                {#if r.hasFirstSubmission} · 🔥 décompte actif{/if}
              </span>
            </span>
            <span class="chip text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0
                         {phaseTone(r.phase)}">
              {phaseLabel(r.phase)}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
