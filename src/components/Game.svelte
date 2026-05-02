<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { BOARD_SIZE, DISTRIBUTION, RACK_SIZE } from '../engine/constants';
  import { loadDictionary, type Dictionary } from '../engine/dictionary';
  import { resolveDuel, type DuelOutcome, type DuelSubmission } from '../engine/game';
  import type { HintReport } from '../engine/hints';
  import { validatePlayerMove } from '../engine/moves';
  import { createEmptyBoard } from '../engine/board';
  import { createBag, refill, shuffle } from '../engine/bag';
  import { rng } from '../engine/rng';
  import type { Move, Placement, RackTile, Direction } from '../engine/types';
  import { EASTER_EGGS } from '../lib/easter-eggs';
  import {
    LocalTransport, pickColor, generatePlayerId,
    type SessionTransport, type SharedSession, type LobbyPlayer,
  } from '../lib/session';
  import { SupabaseTransport, readSupabaseConfig, roomFromHash } from '../lib/supabase';
  import Chat from './Chat.svelte';
  import History from './History.svelte';
  import type { ChatMessage } from '../lib/session';
  import Handover from './Handover.svelte';
  import Board from './Board.svelte';
  import Board3D from './Board3D.svelte';
  import Rack from './Rack.svelte';
  import HintsPanel from './HintsPanel.svelte';
  import DrawPanel from './DrawPanel.svelte';
  import BlankPicker from './BlankPicker.svelte';
  import Confetti from './Confetti.svelte';
  import Toast from './Toast.svelte';
  import Coach from './Coach.svelte';
  import DuelReveal from './DuelReveal.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Join from './Join.svelte';
  import Lobby from './Lobby.svelte';
  import WaitingOthers from './WaitingOthers.svelte';

  // ─── Shared session ────────────────────────────────────────────────────
  let transport: SessionTransport;
  let clientId: string;
  let shared: SharedSession | null = null;
  let unsub: () => void = () => {};

  // ─── Dictionary ────────────────────────────────────────────────────────
  let dict: Dictionary | null = null;
  let dictLoading = true;

  // ─── Per-player (this client's) UI state ──────────────────────────────
  let selectedTileId: string | null = null;
  let pending: (Placement & { tileId: string })[] = [];
  let hintReport: HintReport | null = null;
  let hintsLoading = false;
  let ghost: Placement[] = [];
  let lastError: string | null = null;
  let mode3d = false;
  let cursor: { row: number; col: number; dir: Direction } | null = { row: 7, col: 7, dir: 'H' };
  let confettiTrigger = 0;
  let toastMessage: { id: number; emoji: string; text: string; title: string } | null = null;
  let board3dRef: Board3D | undefined;
  let flyMenu = false;
  let hintsOpen = false;
  let drawOpen = false;
  let blankPicker: { row: number; col: number; tileId: string } | null = null;

  // ─── Hot-seat: which of my local seats currently controls the device ──
  let activeLocalPlayerId: string | null = null;
  let pendingHandover: { playerId: string } | null = null;

  // ─── Hint-usage flags (per active seat, per turn) ─────────────────────
  let usedHints = false;       // player ran "Analyser" / consulted the suggestions
  let appliedHint = false;     // player applied a suggestion directly to pending

  // ─── Reactive derivations ──────────────────────────────────────────────
  $: pendingIds = new Set(pending.map(p => p.tileId));
  $: myPlayers = shared?.players.filter(p => p.clientId === clientId) ?? [];
  $: me = myPlayers.find(p => p.playerId === activeLocalPlayerId) ?? myPlayers[0] ?? null;
  $: iAmHost = shared?.hostClientId === clientId;
  $: iHaveSubmitted = !!(shared && me && me.playerId in (shared.submissions ?? {}));
  $: allMyPlayersSubmitted = !!shared && myPlayers.length > 0
    && myPlayers.every(p => p.playerId in (shared.submissions ?? {}));
  $: playerColors = shared ? Object.fromEntries(shared.players.map(p => [p.playerId, p.color])) : {};
  $: activeAccent = me?.color ?? '#a3e635';
  $: handoverPlayer = (pendingHandover && shared)
    ? shared.players.find(p => p.playerId === pendingHandover!.playerId) ?? null
    : null;

  // Live preview: validate `pending` on every change so the player sees their
  // candidate word + score (or the reason it's invalid) before submitting.
  let liveOk: { word: string; score: number; bingo: boolean } | null = null;
  let liveError: string | null = null;
  $: {
    if (!dict || !shared || shared.phase !== 'play' || iHaveSubmitted || pending.length === 0) {
      liveOk = null; liveError = null;
    } else {
      const placements: Placement[] = pending.map(({ tileId, ...p }) => p);
      const v = validatePlayerMove(shared.board, placements, dict);
      if ('error' in v) { liveOk = null; liveError = v.error; }
      else { liveOk = { word: v.move.word, score: v.move.score, bingo: v.move.bingo }; liveError = null; }
    }
  }

  // ─── Transport selection ──────────────────────────────────────────────
  // Use Supabase when env vars are configured AND the URL has #room=…;
  // otherwise fall back to LocalTransport (single-device hot-seat).
  let activeRoomId: string | null = null;
  function pickTransport(): SessionTransport {
    const cfg = readSupabaseConfig();
    const room = roomFromHash();
    if (cfg && room) {
      activeRoomId = room;
      return new SupabaseTransport(cfg.url, cfg.anonKey, room);
    }
    activeRoomId = null;
    return new LocalTransport();
  }

  // ─── Mount ─────────────────────────────────────────────────────────────
  let supabaseConfigured = false;
  onMount(async () => {
    transport = pickTransport();
    clientId = transport.getClientId();
    supabaseConfigured = !!readSupabaseConfig();
    // React to user changing the hash (e.g., clicking a share link).
    window.addEventListener('hashchange', () => window.location.reload());
    unsub = transport.subscribe(s => {
      const prevPhase = shared?.phase;
      shared = s;
      // Phase transition side-effects
      if (s && prevPhase !== s.phase) handlePhaseChange(prevPhase, s.phase, s);
      // When another client triggers reveal, fire animations here too.
      if (s?.lastTurnResult && prevPhase === 'play' && s.phase === 'reveal') playRevealEffects(s.lastTurnResult);
    });
    try { dict = await loadDictionary(); }
    finally { dictLoading = false; }
  });

  onDestroy(() => unsub());

  function handlePhaseChange(_from: SharedSession['phase'] | undefined, to: SharedSession['phase'], next: SharedSession) {
    if (to === 'play') {
      resetLocal();
      usedHints = false;
      appliedHint = false;
      cursor = { row: 7, col: 7, dir: 'H' };
      // Hand control to the first local player; if there are 2+ seats, show the handover banner.
      const localSeats = next.players.filter(p => p.clientId === clientId);
      const first = localSeats[0]?.playerId ?? null;
      activeLocalPlayerId = first;
      pendingHandover = first && localSeats.length > 1 ? { playerId: first } : null;
    }
    if (to === 'lobby') resetLocal();
  }

  async function playRevealEffects(result: NonNullable<SharedSession['lastTurnResult']>) {
    await tick();
    if (!result.topMove) return;
    if (result.topMove.bingo) {
      confettiTrigger++;
      board3dRef?.celebrateBingo(result.topMove.placements);
      board3dRef?.shake(1.4);
      const who = result.humanOverride?.playerName ?? 'Ordi';
      showToast('🎯', 'BINGO', `+${result.topMove.score} pts (${who})`);
    } else if (result.topMove.score >= 35) {
      board3dRef?.shake(0.6);
    }
    detectEasterEgg([result.topMove.word]);
    if (result.humanOverride) {
      confettiTrigger++;
      showToast('🙇', 'Sorry-sorry',
        `${result.humanOverride.playerName} bat l'Ordi avec ${result.topMove.word} (${result.topMove.score} pts).`);
    } else {
      const matchers = result.outcomes.filter(o => o.diff === 0);
      if (matchers.length > 0) {
        showToast('🎯', 'TOP TROUVÉ', `${matchers.map(m => m.playerName).join(', ')} a trouvé le top !`);
      }
    }
  }

  // ─── Lobby / join / leave ──────────────────────────────────────────────
  function createEmptyShared(): SharedSession {
    const seed = Date.now() & 0xffff;
    const r = rng(seed);
    const initialBag = shuffle(createBag(), r);
    const { rack, bag } = refill([], initialBag, r);
    return {
      version: 0,
      phase: 'lobby',
      hostClientId: null,
      players: [],
      board: createEmptyBoard(),
      rack: rack.map((l, i) => ({ letter: l, id: `${l}-0-${i}-${Math.random().toString(36).slice(2, 7)}` })),
      bag,
      reserved: [],
      turn: 1,
      topScoreCum: 0,
      duelHistory: [],
      submissions: {},
      lastTurnResult: null,
      seed,
      startedAt: null,
      chat: [],
    };
  }

  async function joinAs(names: string[]) {
    const cleanNames = names.map(n => n.trim()).filter(Boolean);
    if (cleanNames.length === 0) return;
    await transport.update(s => {
      const base = s ?? createEmptyShared();
      if (base.phase !== 'lobby') return base;          // closed — can't join mid-game
      // Allow adding extra seats from this device, but skip exact-name duplicates already on this clientId.
      const myExisting = new Set(
        base.players.filter(p => p.clientId === clientId).map(p => p.name.toLowerCase())
      );
      let players = [...base.players];
      for (const name of cleanNames) {
        if (myExisting.has(name.toLowerCase())) continue;
        const color = pickColor(players);
        players = [...players, { playerId: generatePlayerId(), clientId, name, color, rawScore: 0 }];
      }
      return {
        ...base,
        players,
        hostClientId: base.hostClientId ?? clientId,     // first device to arrive = host
      };
    });
  }

  async function renamePlayer(playerId: string, name: string) {
    await transport.update(s => {
      if (!s) return createEmptyShared();
      return { ...s, players: s.players.map(p => p.playerId === playerId ? { ...p, name } : p) };
    });
  }

  async function leaveLobby() {
    await transport.update(s => {
      if (!s) return createEmptyShared();
      const players = s.players.filter(p => p.clientId !== clientId);
      const hostClientId = s.hostClientId === clientId ? (players[0]?.clientId ?? null) : s.hostClientId;
      return { ...s, players, hostClientId };
    });
    resetLocal();
  }

  async function hostStart() {
    if (!iAmHost || !shared) return;
    if (shared.players.length < 2) return;
    await transport.update(s => {
      if (!s) return createEmptyShared();
      return { ...s, phase: 'play', startedAt: Date.now() };
    });
  }

  async function fullReset() {
    await transport.reset();
    resetLocal();
  }

  // ─── Local placement / cursor / keyboard ──────────────────────────────
  function cellBusy(r: number, c: number): boolean {
    if (!shared) return false;
    return !!(shared.board[r][c].letter || pending.some(p => p.row === r && p.col === c));
  }
  function advance(cur: { row: number; col: number; dir: Direction }) {
    let { row, col, dir } = cur;
    while (true) {
      if (dir === 'H') col++; else row++;
      if (row >= BOARD_SIZE || col >= BOARD_SIZE) return null;
      if (!cellBusy(row, col)) return { row, col, dir };
    }
  }
  function firstFree(from: { row: number; col: number; dir: Direction }) {
    let cur = { ...from };
    while (cellBusy(cur.row, cur.col)) {
      const nxt = advance(cur);
      if (!nxt) return null;
      cur = nxt;
    }
    return cur;
  }

  function handleSelect(id: string | null) { selectedTileId = id; }

  function handleCellClick(r: number, c: number) {
    if (!shared || shared.phase !== 'play' || iHaveSubmitted) return;
    const idx = pending.findIndex(p => p.row === r && p.col === c);
    if (idx !== -1) {
      pending = pending.filter((_, i) => i !== idx);
      cursor = { row: r, col: c, dir: cursor?.dir ?? 'H' };
      return;
    }
    if (shared.board[r][c].letter) return;
    if (selectedTileId) {
      const t = shared.rack.find(x => x.id === selectedTileId);
      if (t) placeRackTile(r, c, t);
      return;
    }
    if (cursor && cursor.row === r && cursor.col === c) {
      cursor = { ...cursor, dir: cursor.dir === 'H' ? 'V' : 'H' };
    } else {
      cursor = { row: r, col: c, dir: cursor?.dir ?? 'H' };
    }
  }

  function placeRackTile(r: number, c: number, tile: RackTile) {
    if (tile.letter === '?') {
      blankPicker = { row: r, col: c, tileId: tile.id };
      return;
    }
    pending = [...pending, { row: r, col: c, letter: tile.letter, blank: false, tileId: tile.id }];
    selectedTileId = null;
    cursor = { row: r, col: c, dir: cursor?.dir ?? 'H' };
    cursor = advance(cursor) ?? null;
  }

  function confirmBlank(letter: string) {
    if (!blankPicker) return;
    const { row, col, tileId } = blankPicker;
    pending = [...pending, { row, col, letter, blank: true, tileId }];
    blankPicker = null;
    selectedTileId = null;
    const adv = cursor ? advance({ row, col, dir: cursor.dir }) : null;
    cursor = adv;
  }
  function cancelBlank() { blankPicker = null; }

  function typeLetter(letter: string) {
    if (!shared || shared.phase !== 'play' || iHaveSubmitted || !cursor) return;
    const slot = firstFree(cursor);
    if (!slot) return;
    const usedIds = new Set(pending.map(p => p.tileId));
    let tile = shared.rack.find(t => !usedIds.has(t.id) && t.letter === letter);
    let blank = false;
    if (!tile) {
      tile = shared.rack.find(t => !usedIds.has(t.id) && t.letter === '?');
      if (!tile) return;
      blank = true;
    }
    pending = [...pending, { row: slot.row, col: slot.col, letter, blank, tileId: tile.id }];
    cursor = advance({ row: slot.row, col: slot.col, dir: slot.dir });
  }
  function backspace() {
    if (pending.length === 0) return;
    const last = pending[pending.length - 1];
    pending = pending.slice(0, -1);
    cursor = { row: last.row, col: last.col, dir: cursor?.dir ?? 'H' };
  }
  function moveCursor(dRow: number, dCol: number, dir: Direction) {
    if (!cursor) { cursor = { row: 7, col: 7, dir }; return; }
    const row = Math.max(0, Math.min(BOARD_SIZE - 1, cursor.row + dRow));
    const col = Math.max(0, Math.min(BOARD_SIZE - 1, cursor.col + dCol));
    cursor = { row, col, dir };
  }

  function handleKey(e: KeyboardEvent) {
    if (dictLoading || blankPicker || !shared) return;
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
    if (shared.phase === 'lobby' || shared.phase === 'ended') return;
    if (shared.phase === 'reveal') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); continueAfterReveal(); }
      return;
    }
    if (iHaveSubmitted) return;

    const k = e.key;
    if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); typeLetter(k.toUpperCase()); return; }
    switch (k) {
      case 'Backspace': case 'Delete': e.preventDefault(); backspace(); break;
      case 'Enter': e.preventDefault(); handleSubmit(); break;
      case 'Escape': e.preventDefault(); resetPending(); break;
      case 'ArrowRight': e.preventDefault(); moveCursor(0, 1, 'H'); break;
      case 'ArrowLeft':  e.preventDefault(); moveCursor(0, -1, 'H'); break;
      case 'ArrowDown':  e.preventDefault(); moveCursor(1, 0, 'V'); break;
      case 'ArrowUp':    e.preventDefault(); moveCursor(-1, 0, 'V'); break;
      case ' ':
        if (cursor) { e.preventDefault(); cursor = { ...cursor, dir: cursor.dir === 'H' ? 'V' : 'H' }; }
        break;
      case '3': if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); mode3d = !mode3d; } break;
      case '2': if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); mode3d = false; } break;
      case 'R': case 'r':
        if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); shuffleMyRackView(); }
        break;
      case '?': e.preventDefault(); showToast('⌨️', 'Raccourcis', 'Tapez · flèches · Entrée · Échap · Espace · 3 · R'); break;
    }
  }

  function showToast(emoji: string, title: string, text: string) {
    toastMessage = { id: Date.now(), emoji, title, text };
  }
  function resetLocal() {
    pending = []; selectedTileId = null; hintReport = null; ghost = []; lastError = null;
  }
  function resetPending() { resetLocal(); }

  // Rack is shared — locally we just rearrange our view (optional cosmetic).
  // For simplicity, skip real shuffling in multiplayer to keep views consistent.
  function shuffleMyRackView() {
    if (!shared) return;
    showToast('ℹ️', 'Rack partagé', 'Le mélange est purement visuel en multijoueur.');
  }

  async function setReserved(r: string[]) {
    await transport.update(s => s ? { ...s, reserved: r } : createEmptyShared());
  }

  async function analyze() {
    // The HintsPanel no longer renders real hints — it serves cheap nonsense
    // in a comic bubble. We just flag the consultation so the reveal can shame
    // the player accordingly.
    usedHints = true;
  }
  function setGhostFromHint(m: Move | null) { ghost = m ? m.placements : []; }
  function applyHintAsPending(m: Move) {
    if (!shared) return;
    const usedIds = new Set<string>();
    const plan: (Placement & { tileId: string })[] = [];
    const rackCopy: RackTile[] = [...shared.rack];
    for (const p of m.placements) {
      const needed = p.blank ? '?' : p.letter;
      const idx = rackCopy.findIndex(t => !usedIds.has(t.id) && t.letter === needed);
      if (idx === -1) return;
      plan.push({ ...p, tileId: rackCopy[idx].id });
      usedIds.add(rackCopy[idx].id);
    }
    pending = plan;
    ghost = [];
    cursor = { row: m.row, col: m.col, dir: m.dir };
    usedHints = true;
    appliedHint = true;
  }

  function detectEasterEgg(words: string[]) {
    for (const w of words) {
      const egg = EASTER_EGGS[w];
      if (egg) { showToast(egg.emoji, w, egg.text); return; }
    }
  }

  // ─── Submit flow ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!dict || !shared || shared.phase !== 'play' || !me || iHaveSubmitted) return;
    const placements: Placement[] = pending.map(({ tileId, ...p }) => p);
    if (placements.length > 0) {
      const v = validatePlayerMove(shared.board, placements, dict);
      if ('error' in v) { lastError = v.error; return; }
    }
    lastError = null;

    const record = {
      placements: placements.length > 0 ? placements : null,
      submittedAt: Date.now(),
      usedHints,
      appliedHint,
    };
    const submittingPlayerId = me.playerId;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);

    // Write my submission, check if we're the last, and resolve if so.
    await transport.update(s => {
      if (!s || s.phase !== 'play') return s ?? createEmptyShared();
      const submissions = { ...s.submissions, [submittingPlayerId]: record };
      const allIn = s.players.every(p => submissions[p.playerId]);
      if (!allIn) {
        return { ...s, submissions };
      }
      // Resolve locally, publish everything.
      const subs: DuelSubmission[] = s.players.map(p => ({
        playerId: p.playerId,
        playerName: p.name,
        placements: submissions[p.playerId].placements,
        submittedAt: submissions[p.playerId].submittedAt,
        usedHints: submissions[p.playerId].usedHints,
        appliedHint: submissions[p.playerId].appliedHint,
      }));
      const engineState = {
        board: s.board,
        rack: s.rack,
        bag: s.bag,
        reserved: s.reserved,
        turn: s.turn,
        totalScore: s.topScoreCum,
        topScore: s.topScoreCum,
        history: [],
        seed: s.seed,
        overridden: false,
      };
      const result = resolveDuel(engineState, subs, dict!);
      const byId = new Map(result.outcomes.map(o => [o.playerId, o]));
      const players = s.players.map(p => ({
        ...p,
        rawScore: p.rawScore + (byId.get(p.playerId)?.score ?? 0),
      }));
      const ended = result.state.bag.length === 0 && result.state.rack.length === 0;
      return {
        ...s,
        phase: ended ? 'ended' : 'reveal',
        board: result.state.board,
        rack: result.state.rack,
        bag: result.state.bag,
        reserved: [],
        turn: result.state.turn,
        topScoreCum: s.topScoreCum + result.topScore,
        duelHistory: [...s.duelHistory, {
          turn: s.turn,
          outcomes: result.outcomes,
          topMove: result.topMove,
          topScore: result.topScore,
          ordiMove: result.ordiMove,
          ordiScore: result.ordiScore,
          humanOverride: result.humanOverride,
        }],
        submissions: {},
        lastTurnResult: {
          outcomes: result.outcomes,
          topMove: result.topMove,
          topScore: result.topScore,
          ordiMove: result.ordiMove,
          ordiScore: result.ordiScore,
          humanOverride: result.humanOverride,
        },
        players,
      };
    });
    // Clear my local pending after recording.
    resetLocal();
    // Hint flags belong to the seat that just submitted; the next seat starts fresh.
    usedHints = false;
    appliedHint = false;
    hintReport = null;

    // Hot-seat: if another local seat hasn't submitted yet, hand the device over to them.
    if (shared && shared.phase === 'play') {
      const submitted = new Set(Object.keys(shared.submissions ?? {}));
      const localSeats = shared.players.filter(p => p.clientId === clientId);
      const next = localSeats.find(p => !submitted.has(p.playerId));
      if (next) {
        activeLocalPlayerId = next.playerId;
        pendingHandover = { playerId: next.playerId };
        cursor = { row: 7, col: 7, dir: 'H' };
      }
    }
  }

  function dismissHandover() { pendingHandover = null; }

  async function passTurn() {
    pending = [];
    await handleSubmit();
  }

  async function continueAfterReveal() {
    if (!shared) return;
    await transport.update(s => {
      if (!s) return createEmptyShared();
      if (s.phase === 'reveal') return { ...s, phase: 'play', lastTurnResult: null };
      return s;
    });
  }

  // ─── End-game winner ───────────────────────────────────────────────────
  $: leader = shared ? [...shared.players].sort((a, b) => b.rawScore - a.rawScore)[0] : null;

  // ─── Online room banner (Join / Lobby screen only) ────────────────────
  let copiedLink = false;
  $: shareUrl = activeRoomId && typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#room=${activeRoomId}`
    : '';

  async function startOnlineRoom() {
    if (!readSupabaseConfig()) return;
    const { generateRoomId, setRoomInUrl } = await import('../lib/supabase');
    setRoomInUrl(generateRoomId()); // hashchange listener reloads → SupabaseTransport activates
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copiedLink = true;
      setTimeout(() => { copiedLink = false; }, 1800);
    } catch { /* clipboard blocked — user can copy from the address bar */ }
  }

  async function leaveOnlineRoom() {
    window.location.hash = '';
    window.location.reload();
  }

  // ─── Full history modal ───────────────────────────────────────────────
  let historyOpen = false;

  // ─── Chat ─────────────────────────────────────────────────────────────
  $: chatMessages = shared?.chat ?? [];
  $: chatStorageKey = `cdrs-chat-seen-${activeRoomId ?? 'local'}`;
  $: chatMe = me ? { playerId: me.playerId, name: me.name, color: me.color } : null;

  async function sendChat(text: string) {
    if (!me) return;
    const trimmed = text.slice(0, 280);
    const msg: ChatMessage = {
      id: `${me.playerId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playerId: me.playerId,
      playerName: me.name,
      color: me.color,
      text: trimmed,
      at: Date.now(),
    };
    await transport.update(s => {
      const base = s ?? createEmptyShared();
      const chat = [...(base.chat ?? []), msg].slice(-200); // cap at 200 to keep payload small
      return { ...base, chat };
    });
  }
</script>

<svelte:window on:keydown={handleKey} />

{#if !shared || shared.phase === 'lobby'}
  {#if activeRoomId}
    <div class="max-w-lg mx-auto px-4 pt-6">
      <div class="panel px-4 py-3 flex items-center justify-between gap-3 text-sm">
        <span class="font-mono text-mist-500">🌐 Salon · <span class="text-neon font-display">{activeRoomId}</span></span>
        <span class="flex items-center gap-2">
          <button class="btn-ghost !px-3 !py-1.5 text-xs" on:click={copyShareLink}>
            {copiedLink ? '✓ Copié' : 'Copier le lien'}
          </button>
          <button class="btn-ghost !px-3 !py-1.5 text-xs" on:click={leaveOnlineRoom}>Quitter</button>
        </span>
      </div>
    </div>
  {:else if supabaseConfigured}
    <div class="max-w-lg mx-auto px-4 pt-6">
      <button class="panel w-full px-4 py-3 text-sm hover:bg-white/[0.06] transition" on:click={startOnlineRoom}>
        📱 Mode local · <span class="text-neon">Inviter à distance</span>
      </button>
    </div>
  {/if}
  <!-- JOIN + LOBBY merge: show join when we're not in, lobby when we are. -->
  {#if !shared || !shared.players.some(p => p.clientId === clientId)}
    <Join
      dictLoading={dictLoading}
      activePlayerCount={shared?.players.length ?? 0}
      gameInProgress={!!shared && shared.phase !== 'lobby'}
      onJoin={joinAs}
      onNewGame={fullReset}
    />
  {:else}
    <Lobby
      players={shared.players}
      myClientId={clientId}
      hostClientId={shared.hostClientId}
      canStart={shared.players.length >= 2}
      dictLoading={dictLoading}
      onRename={renamePlayer}
      onAddSeat={(name) => joinAs([name])}
      onLeave={leaveLobby}
      onStart={hostStart}
    />
  {/if}
{:else if shared.phase === 'ended'}
  <div class="max-w-2xl mx-auto px-4 py-14 space-y-8 text-center animate-slide-up">
    <p class="text-xs uppercase tracking-[0.2em] text-mist-500 font-mono">Partie terminée</p>
    <h1 class="font-display text-5xl">🏆 {leader?.name} l'emporte</h1>
    <p class="text-mist-500">Maximum théorique (Ordi) : <span class="text-neon-glow font-mono">{shared.topScoreCum}</span></p>
    <div class="panel p-6 grid gap-3">
      {#each [...shared.players].sort((a,b) => b.rawScore - a.rawScore) as p, i}
        {@const diff = p.rawScore - shared.topScoreCum}
        <div class="flex items-center justify-between" style="color: {p.color};">
          <span class="font-display">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {p.name}</span>
          <span class="flex items-baseline gap-3">
            <span class="font-mono text-2xl">{p.rawScore}</span>
            <span class="font-mono text-sm opacity-70">{diff >= 0 ? '±0' : diff}</span>
          </span>
        </div>
      {/each}
    </div>
    <button class="btn-primary" on:click={fullReset}>Nouvelle partie</button>
  </div>
{:else}
  <!-- PLAY + REVEAL layout -->
  <div class="max-w-7xl mx-auto px-3 lg:px-4 pt-4 lg:py-3 space-y-3 lg:space-y-3 {shared.phase === 'play' && !iHaveSubmitted ? 'pb-44 lg:pb-0' : 'pb-8'}">
    <header class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-2 lg:gap-3 min-w-0">
        <div class="w-9 h-9 lg:w-11 lg:h-11 rounded-xl font-display font-bold grid place-items-center shadow-[0_0_24px_-6px_currentColor] shrink-0"
             style="background: {activeAccent}; color: #07080c;">D</div>
        <div class="min-w-0">
          <h1 class="text-xl lg:text-2xl font-display leading-tight">Duel</h1>
          <p class="text-[10px] lg:text-xs font-mono uppercase tracking-wider truncate"
             style="color: {me?.color ?? '#6b7388'};">
            {me?.name ?? 'spectateur'} · manche {shared.turn}
            {#if shared.phase === 'reveal'} · résolution{/if}
            {#if iHaveSubmitted && shared.phase === 'play'} · attente{/if}
          </p>
        </div>
      </div>
      <div class="flex gap-1.5 lg:gap-2 items-center">
        <div class="flex p-0.5 lg:p-1 rounded-xl border border-white/5 bg-white/5 text-xs font-mono">
          <button
            class="px-2.5 lg:px-3 py-1 rounded-lg transition {!mode3d ? 'bg-neon text-night-900' : 'text-mist-500 hover:text-mist-100'}"
            on:click={() => mode3d = false}
          >2D</button>
          <button
            class="px-2.5 lg:px-3 py-1 rounded-lg transition {mode3d ? 'bg-neon text-night-900' : 'text-mist-500 hover:text-mist-100'}"
            on:click={() => mode3d = true}
          >3D</button>
        </div>
        {#if mode3d}
          <div class="relative">
            <button class="btn-ghost !px-2.5 !py-1.5 text-xs" on:click={() => flyMenu = !flyMenu}>✈️</button>
            {#if flyMenu}
              <div class="absolute right-0 top-full mt-2 panel p-1.5 text-sm w-48 animate-pop-in z-20">
                {#each [
                  { k: 'default',   label: '🎬 Survol complet' },
                  { k: 'topdown',   label: '🛰 Vue du ciel' },
                  { k: 'sideslide', label: '↔ Travelling latéral' },
                  { k: 'vertigo',   label: '🔭 Dolly arrière' },
                  { k: 'closeup',   label: '🔍 Gros plans' },
                ] as p}
                  <button class="w-full text-left rounded-md px-3 py-1.5 hover:bg-white/10"
                          on:click={() => { flyMenu = false; board3dRef?.flyOver(p.k); }}>
                    {p.label}
                  </button>
                {/each}
                <div class="border-t border-white/10 my-1"></div>
                <button class="w-full text-left rounded-md px-3 py-1.5 hover:bg-white/10"
                        on:click={() => { flyMenu = false; board3dRef?.resetCamera(); }}>
                  ↺ Recentrer
                </button>
              </div>
            {/if}
          </div>
        {/if}
        <button class="btn-ghost !px-2.5 !py-1.5 text-xs" on:click={fullReset} title="Abandonner la partie">↻</button>
      </div>
    </header>

    <div class="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(300px,380px)] lg:gap-4 lg:items-start">
      <aside class="lg:col-start-2 lg:row-start-1">
        <Scoreboard
          players={shared.players.map(p => ({ id: p.playerId, name: p.name, rawScore: p.rawScore, color: p.color }))}
          history={shared.duelHistory}
          currentPlayerId={me?.playerId ?? ''}
          turn={shared.turn}
          topScoreCum={shared.topScoreCum}
          onShowFullHistory={() => historyOpen = true}
        />
      </aside>

      <main class="lg:col-start-1 lg:row-start-1 lg:row-span-5 space-y-3">
        {#if mode3d}
          <Board3D
            bind:this={board3dRef}
            board={shared.board}
            pending={pending}
            ghost={ghost}
            cursor={shared.phase === 'play' && !iHaveSubmitted ? cursor : null}
            on:cellClick={(e) => handleCellClick(e.detail.r, e.detail.c)}
          />
        {:else}
          <Board
            board={shared.board}
            pending={pending}
            ghost={ghost}
            cursor={shared.phase === 'play' && !iHaveSubmitted ? cursor : null}
            mode3d={false}
            onCellClick={handleCellClick}
          />
        {/if}

        {#if shared.phase === 'play' && !iHaveSubmitted}
          <div class="hidden lg:block space-y-2">
            <Rack
              rack={shared.rack}
              selectedId={selectedTileId}
              pendingIds={pendingIds}
              onSelect={handleSelect}
              onShuffle={shuffleMyRackView}
            />
            <div class="flex flex-wrap items-center gap-2">
              <button class="btn-primary" on:click={handleSubmit} disabled={!dict}
                      style={`background: ${me?.color ?? '#a3e635'}; box-shadow: 0 4px 20px -4px ${(me?.color ?? '#a3e635')}80;`}>
                Valider <span class="ml-1 text-xs opacity-60 font-mono">⏎</span>
              </button>
              <button class="btn-ghost" on:click={resetPending} disabled={pending.length === 0}>
                Effacer <span class="ml-1 text-xs opacity-60 font-mono">Esc</span>
              </button>
              <button class="btn-ghost" on:click={passTurn}>Passer</button>
              {#if liveOk}
                <span class="text-sm font-mono" style="color: {me?.color ?? '#a3e635'};">
                  {liveOk.word} · <span class="text-base font-display">{liveOk.score}</span> pts{#if liveOk.bingo} · <span class="text-amber-300">BINGO</span>{/if}
                </span>
              {:else if liveError}
                <span class="text-sm text-rose-glow">⚠ {liveError}</span>
              {:else if lastError}
                <span class="text-sm text-rose-glow">⚠ {lastError}</span>
              {/if}
            </div>
          </div>
        {:else if shared.phase === 'play' && iHaveSubmitted}
          <WaitingOthers
            players={shared.players}
            submissions={shared.submissions}
            myClientId={clientId}
          />
        {:else if shared.phase === 'reveal' && shared.lastTurnResult}
          <DuelReveal
            outcomes={shared.lastTurnResult.outcomes}
            topMove={shared.lastTurnResult.topMove}
            topScore={shared.lastTurnResult.topScore}
            ordiMove={shared.lastTurnResult.ordiMove ?? shared.lastTurnResult.topMove}
            ordiScore={shared.lastTurnResult.ordiScore ?? shared.lastTurnResult.topScore}
            humanOverride={shared.lastTurnResult.humanOverride ?? null}
            playerColors={playerColors}
            onContinue={continueAfterReveal}
          />
        {/if}
      </main>

      {#if shared.phase === 'play' && !iHaveSubmitted}
        <aside class="lg:col-start-2 lg:row-start-2">
          <button
            class="panel w-full px-4 py-3 mb-2 flex items-center justify-between"
            on:click={() => hintsOpen = !hintsOpen}
          >
            <span class="font-display text-sm">Aide progressive</span>
            <span class="text-mist-500 transition-transform {hintsOpen ? 'rotate-180' : ''}">▾</span>
          </button>
          {#if hintsOpen}
            <div class="animate-slide-up">
              <HintsPanel
                report={hintReport}
                loading={hintsLoading}
                onAnalyze={analyze}
                onHover={setGhostFromHint}
                onApply={applyHintAsPending}
              />
            </div>
          {/if}
        </aside>

        <aside class="lg:col-start-2 lg:row-start-3">
          <button
            class="panel w-full px-4 py-3 mb-2 flex items-center justify-between"
            on:click={() => drawOpen = !drawOpen}
          >
            <span class="font-display text-sm">Influencer le tirage</span>
            <span class="text-mist-500 transition-transform {drawOpen ? 'rotate-180' : ''}">▾</span>
          </button>
          {#if drawOpen}
            <div class="animate-slide-up">
              <DrawPanel bag={shared.bag} reserved={shared.reserved} onChange={setReserved} />
            </div>
          {/if}
        </aside>
      {/if}
    </div>
  </div>

  {#if shared.phase === 'play' && !iHaveSubmitted}
    <div class="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-night-900/95 backdrop-blur border-t border-white/10">
      <div class="px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] space-y-2">
        {#if liveOk}
          <p class="text-xs font-mono text-center truncate" style="color: {me?.color ?? '#a3e635'};">
            {liveOk.word} · <span class="font-display text-sm">{liveOk.score}</span> pts{#if liveOk.bingo} · BINGO{/if}
          </p>
        {:else if liveError}
          <p class="text-xs text-rose-glow text-center truncate">⚠ {liveError}</p>
        {/if}
        <Rack
          rack={shared.rack}
          selectedId={selectedTileId}
          pendingIds={pendingIds}
          onSelect={handleSelect}
          onShuffle={shuffleMyRackView}
        />
        <div class="flex gap-1.5">
          <button
            class="btn-primary flex-1 !py-2"
            on:click={handleSubmit}
            disabled={!dict}
            style={`background: ${me?.color ?? '#a3e635'}; box-shadow: 0 4px 20px -4px ${(me?.color ?? '#a3e635')}80;`}
          >Valider</button>
          <button class="btn-ghost !px-3 !py-2" on:click={resetPending} disabled={pending.length === 0}
                  aria-label="Effacer">✕</button>
          <button class="btn-ghost !px-3 !py-2" on:click={passTurn} aria-label="Passer">⏭</button>
        </div>
        {#if lastError && !liveOk && !liveError}
          <p class="text-xs text-rose-glow text-center truncate">⚠ {lastError}</p>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<Toast message={toastMessage} />
<Confetti trigger={confettiTrigger} />
<BlankPicker open={!!blankPicker} onPick={confirmBlank} onCancel={cancelBlank} />
{#if shared && shared.players.length > 1}
  <Chat
    messages={chatMessages}
    me={chatMe}
    onSend={sendChat}
    storageKey={chatStorageKey}
  />
{/if}
{#if historyOpen && shared}
  <History
    history={shared.duelHistory}
    playerColors={playerColors}
    onClose={() => historyOpen = false}
  />
{/if}<Coach />
{#if pendingHandover && shared?.phase === 'play' && handoverPlayer}
  <Handover name={handoverPlayer.name} color={handoverPlayer.color} onContinue={dismissHandover} />
{/if}

<style>
  :global(.kb) {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    color: #e2e6ef;
  }
</style>
