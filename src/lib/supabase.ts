// Cross-device session transport via Supabase Postgres + Realtime.
//
// One row per game in the `sessions` table, keyed by `room_id`. All clients
// subscribed to the same room see the same SharedSession state. Writes are
// last-write-wins on `data`; the existing Game.svelte resolution logic is
// already idempotent enough for two-player turn-based use.
//
// SQL to run once in your Supabase project:
//
//   create table public.sessions (
//     room_id    text primary key,
//     version    integer not null default 0,
//     data       jsonb   not null,
//     updated_at timestamptz not null default now()
//   );
//   alter table public.sessions enable row level security;
//   create policy "anon read"  on public.sessions for select using (true);
//   create policy "anon write" on public.sessions for insert with check (true);
//   create policy "anon update" on public.sessions for update using (true);
//   create policy "anon delete" on public.sessions for delete using (true);
//   alter publication supabase_realtime add table public.sessions;
//
// (RLS policies are wide-open since the room ID itself is the secret.)

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionTransport, SharedSession } from './session';
import { generateClientId } from './session';

export class SupabaseTransport implements SessionTransport {
  private clientId: string;
  private listeners = new Set<(s: SharedSession | null) => void>();
  private channel: RealtimeChannel | null = null;
  private current: SharedSession | null = null;
  private client: SupabaseClient;

  constructor(url: string, anonKey: string, public roomId: string) {
    this.clientId = generateClientId();
    this.client = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
    });
    this.bootstrap();
  }

  private async bootstrap() {
    const { data } = await this.client
      .from('sessions')
      .select('data')
      .eq('room_id', this.roomId)
      .maybeSingle();
    if (data?.data) this.current = data.data as SharedSession;
    this.emit();

    this.channel = this.client
      .channel(`room:${this.roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `room_id=eq.${this.roomId}` },
        (payload) => {
          const row = (payload.new ?? null) as { data?: SharedSession; version?: number } | null;
          if (payload.eventType === 'DELETE') {
            this.current = null;
            this.emit();
            return;
          }
          if (row?.data) {
            // Drop out-of-order updates (shouldn't happen with Postgres but cheap to guard).
            if (this.current && row.version != null && row.version <= this.current.version) return;
            this.current = row.data;
            this.emit();
          }
        },
      )
      .subscribe();
  }

  getClientId(): string { return this.clientId; }
  snapshot(): SharedSession | null { return this.current; }

  subscribe(listener: (s: SharedSession | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  async update(mutator: (s: SharedSession | null) => SharedSession): Promise<void> {
    const next = mutator(this.current);
    next.version = (this.current?.version ?? 0) + 1;
    this.current = next;
    this.emit();
    await this.client.from('sessions').upsert(
      { room_id: this.roomId, version: next.version, data: next },
      { onConflict: 'room_id' },
    );
  }

  async reset(): Promise<void> {
    this.current = null;
    this.emit();
    await this.client.from('sessions').delete().eq('room_id', this.roomId);
  }

  private emit() {
    for (const l of this.listeners) l(this.current);
  }
}

// ─── Transport factory ─────────────────────────────────────────────────────

export function roomFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/room=([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

export function generateRoomId(): string {
  // 8 chars, base36, lowercase — short enough to read aloud, long enough to be unguessable.
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

export function setRoomInUrl(roomId: string) {
  if (typeof window === 'undefined') return;
  window.location.hash = `room=${roomId}`;
}

export interface SupabaseConfig { url: string; anonKey: string; }

export interface RoomSummary {
  roomId: string;
  phase: SharedSession['phase'];
  players: { name: string; color: string }[];
  turn: number;
  topScoreCum: number;
  updatedAt: string;
  hasFirstSubmission: boolean;
}

// Public rooms directory. RLS on `sessions` already allows anon select, so
// every client can browse every room (room IDs are no longer secrets).
export async function listRooms(cfg: SupabaseConfig, limit = 30): Promise<RoomSummary[]> {
  const client = createClient(cfg.url, cfg.anonKey);
  const { data, error } = await client
    .from('sessions')
    .select('room_id, data, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data
    .map((row): RoomSummary | null => {
      const d = row.data as SharedSession | null;
      if (!d) return null;
      return {
        roomId: row.room_id as string,
        phase: d.phase,
        players: (d.players ?? []).map(p => ({ name: p.name, color: p.color })),
        turn: d.turn ?? 1,
        topScoreCum: d.topScoreCum ?? 0,
        updatedAt: row.updated_at as string,
        hasFirstSubmission: d.firstSubmittedAt != null,
      };
    })
    .filter((x): x is RoomSummary => x != null);
}

export function readSupabaseConfig(): SupabaseConfig | null {
  // Astro exposes PUBLIC_* env vars to the client at build time.
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
