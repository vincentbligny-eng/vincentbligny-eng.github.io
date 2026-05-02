<script lang="ts">
  import { tick } from 'svelte';
  import type { ChatMessage } from '../lib/session';

  export let messages: ChatMessage[] = [];
  export let me: { playerId: string; name: string; color: string } | null = null;
  export let onSend: (text: string) => Promise<void> | void = () => {};
  export let storageKey: string = 'cdrs-chat-seen-default';

  let open = false;
  let draft = '';
  let listEl: HTMLDivElement | undefined;
  let lastSeen = readSeen();

  function readSeen(): number {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(storageKey) ?? 0);
  }
  function writeSeen(at: number) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(storageKey, String(at));
    lastSeen = at;
  }

  $: unread = open ? 0 : messages.filter(m => m.at > lastSeen && m.playerId !== me?.playerId).length;
  $: latest = messages.length > 0 ? messages[messages.length - 1] : null;

  async function toggle() {
    open = !open;
    if (open) {
      await tick();
      listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'instant' as ScrollBehavior });
      if (latest) writeSeen(latest.at);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || !me) return;
    draft = '';
    await onSend(text);
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
  }

  function formatTime(at: number): string {
    const d = new Date(at);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  $: if (open && latest) writeSeen(latest.at);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); open = false; }
  }
</script>

<!-- Floating chat bubble (above the mobile fixed action bar). -->
<div class="fixed right-3 bottom-3 lg:right-5 lg:bottom-5 z-30 chat-anchor">
  {#if open}
    <div class="panel w-[min(92vw,340px)] h-[min(70vh,440px)] flex flex-col shadow-[0_20px_48px_-12px_rgba(0,0,0,0.7)] animate-pop-in">
      <header class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span class="font-display text-sm">💬 Tchat</span>
        <button class="btn-ghost !px-2 !py-1 text-xs" on:click={toggle} aria-label="Fermer">✕</button>
      </header>

      <div bind:this={listEl} class="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
        {#if messages.length === 0}
          <p class="text-mist-500 text-xs italic text-center py-6">Aucun message. Soyez le premier.</p>
        {:else}
          {#each messages as m (m.id)}
            {@const mine = m.playerId === me?.playerId}
            <div class="flex flex-col {mine ? 'items-end' : 'items-start'}">
              <div class="max-w-[85%] rounded-2xl px-3 py-1.5 break-words"
                   style={mine
                     ? `background: ${m.color}33; color: ${m.color}; border: 1px solid ${m.color}55;`
                     : 'background: rgba(255,255,255,0.06); color: #e2e6ef; border: 1px solid rgba(255,255,255,0.08);'}>
                {#if !mine}
                  <p class="text-[10px] font-mono uppercase tracking-wider mb-0.5" style="color: {m.color};">{m.playerName}</p>
                {/if}
                <p class="leading-tight whitespace-pre-wrap">{m.text}</p>
              </div>
              <span class="text-[9px] font-mono text-mist-500 mt-0.5">{formatTime(m.at)}</span>
            </div>
          {/each}
        {/if}
      </div>

      <form class="border-t border-white/10 p-2 flex gap-1.5" on:submit|preventDefault={send}>
        <input
          type="text"
          bind:value={draft}
          on:keydown={onKeydown}
          maxlength="280"
          placeholder={me ? 'Écris un message…' : 'Rejoins la partie pour discuter'}
          disabled={!me}
          class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
                 focus:outline-none focus:border-neon disabled:opacity-50"
        />
        <button type="submit" disabled={!me || !draft.trim()}
                class="btn-primary !px-3 !py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={me ? `background: ${me.color}; box-shadow: 0 4px 16px -4px ${me.color}80;` : ''}>
          ➤
        </button>
      </form>
    </div>
  {:else}
    <button
      on:click={toggle}
      class="rounded-full w-12 h-12 lg:w-14 lg:h-14 grid place-items-center text-xl
             bg-night-900/95 backdrop-blur border border-white/15 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]
             hover:scale-105 transition relative"
      aria-label="Ouvrir le tchat"
    >
      💬
      {#if unread > 0}
        <span class="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 grid place-items-center rounded-full
                     bg-rose-glow text-night-900 text-[11px] font-mono font-bold">{unread}</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  :global(.chat-anchor) {
    /* Sit above the mobile fixed action bar (which has bottom: 0 + padding). */
    bottom: max(env(safe-area-inset-bottom), 12px);
  }
  @media (min-width: 1024px) {
    :global(.chat-anchor) { bottom: 20px; }
  }
</style>
