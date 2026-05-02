// Shared-session transport for the duel.
// v1 — LocalTransport mirrors state via localStorage + BroadcastChannel
// (works across tabs on the same browser; default for hot-seat play).
// v2 — SupabaseTransport (see ./supabase.ts) — picks up when both env vars
// PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY are present at build time
// AND the page URL has a `#room=...` hash. Lets two devices share a game.

import type { Board, Placement, RackTile, Move } from '../engine/types';
import type { DuelOutcome } from '../engine/game';

export interface LobbyPlayer {
  playerId: string;   // unique per seat (multiple seats can share a clientId in hot-seat mode)
  clientId: string;   // device that owns this seat
  name: string;
  color: string;
  rawScore: number;   // cumulative raw score
}

export function generatePlayerId(): string {
  return 'p-' + Math.random().toString(36).slice(2, 10);
}

export interface TurnRow {
  turn: number;
  outcomes: DuelOutcome[];
  topMove: Move | null;
  topScore: number;
  ordiMove?: Move | null;
  ordiScore?: number;
  humanOverride?: { playerId: string; playerName: string } | null;
}

export interface SubmissionRecord {
  placements: Placement[] | null;  // null = pass
  submittedAt: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  color: string;
  text: string;
  at: number;
}

export type SessionPhase = 'lobby' | 'play' | 'reveal' | 'ended';

export interface SharedSession {
  version: number;
  phase: SessionPhase;
  hostClientId: string | null;
  players: LobbyPlayer[];
  board: Board;
  rack: RackTile[];
  bag: string[];
  reserved: string[];
  turn: number;
  topScoreCum: number;
  duelHistory: TurnRow[];
  submissions: Record<string, SubmissionRecord>;
  lastTurnResult: {
    outcomes: DuelOutcome[];
    topMove: Move | null;
    topScore: number;
    ordiMove?: Move | null;
    ordiScore?: number;
    humanOverride?: { playerId: string; playerName: string } | null;
  } | null;
  seed: number;
  startedAt: number | null;
  chat: ChatMessage[];
}

export interface SessionTransport {
  getClientId(): string;
  snapshot(): SharedSession | null;
  subscribe(listener: (s: SharedSession | null) => void): () => void;
  update(mutator: (s: SharedSession | null) => SharedSession): Promise<void>;
  reset(): Promise<void>;
}

export const PALETTE = ['#fb923c', '#38bdf8', '#a3e635', '#f472b6', '#f87171', '#c084fc'];

export function generateClientId(): string {
  if (typeof localStorage === 'undefined') return 'anon-' + Math.random().toString(36).slice(2, 8);
  const key = 'cdrs-client-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = 'c-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, id);
  }
  return id;
}

export class LocalTransport implements SessionTransport {
  private key = 'cdrs-session';
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<(s: SharedSession | null) => void>();
  private clientId: string;

  constructor() {
    this.clientId = generateClientId();
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('cdrs-session');
      this.channel.onmessage = () => this.emit();
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === this.key) this.emit();
      });
    }
  }

  getClientId(): string { return this.clientId; }

  snapshot(): SharedSession | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try { return JSON.parse(raw) as SharedSession; }
    catch { return null; }
  }

  subscribe(listener: (s: SharedSession | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  async update(mutator: (s: SharedSession | null) => SharedSession): Promise<void> {
    const current = this.snapshot();
    const next = mutator(current);
    next.version = (current?.version ?? 0) + 1;
    localStorage.setItem(this.key, JSON.stringify(next));
    this.emit();
    this.channel?.postMessage('update');
  }

  async reset(): Promise<void> {
    localStorage.removeItem(this.key);
    this.emit();
    this.channel?.postMessage('update');
  }

  private emit() {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }
}

export function pickColor(existing: LobbyPlayer[]): string {
  const used = new Set(existing.map(p => p.color));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
}

export function isHost(s: SharedSession, clientId: string): boolean {
  return s.hostClientId === clientId;
}
