import type { SaveManager } from '@/save/SaveManager';
import { logger } from '@/utils/Logger';
import { authService } from './AuthService';
import { getSupabaseClient } from './supabaseClient';

const TABLE = 'saves';

function readUpdatedAt(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return -Infinity;
  const value = (raw as { updatedAt?: unknown }).updatedAt;
  if (typeof value !== 'string') return -Infinity;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : -Infinity;
}

/**
 * Mirrors SaveManager's document to Supabase for whoever is signed in.
 *
 * Guest play (signed out) never touches the network — the save stays exactly
 * as local-only as it always was, and signing in later does not lose it: the
 * two copies are reconciled by `updatedAt` the moment a session appears,
 * newer one wins, no merge logic beyond that. Every write after that point is
 * pushed on `SaveManager`'s own `save:written` event, so this rides the same
 * coalesced-write schedule gameplay already uses rather than adding a second
 * autosave timer, and syncing stops immediately on sign-out rather than
 * lingering and pushing a signed-out player's local data under someone else's
 * account.
 *
 * Pushes are optimistically-concurrent: each one is conditioned on the row's
 * `updated_at` still being whatever we last saw. Two tabs (or two devices)
 * signed into the same account can otherwise race — a slower tab's stale
 * write landing *after* a faster tab's newer one would silently roll the
 * cloud save backward, since a plain upsert has no idea it's clobbering
 * something newer. A version mismatch means someone else wrote first, which
 * is resolved the same way the initial sign-in reconciliation is: newer
 * `updatedAt` (the one embedded in the JSON document itself, not the row's
 * own timestamp) wins.
 */
export class CloudSaveService {
  private saveManager?: SaveManager;
  private unsubscribeWrite?: () => void;
  /** The row's `updated_at` as of our last successful read or write; `null` until we know one. */
  private cloudRowVersion: string | null = null;

  /** Wires the service to the save manager and starts watching sign-in state. */
  init(saveManager: SaveManager): void {
    this.saveManager = saveManager;

    authService.events.on('signed-in', () => void this.reconcile());
    authService.events.on('signed-out', () => this.stopSyncing());

    // A session restored from a previous visit fires no 'signed-in' event —
    // there is nothing new to sign into — so check directly too.
    if (authService.isSignedIn) void this.reconcile();
  }

  /** Pulls the cloud copy, keeps whichever side is newer, then starts syncing. */
  private async reconcile(): Promise<void> {
    const client = getSupabaseClient();
    const user = authService.currentUser;
    if (!client || !user || !this.saveManager) return;

    const { data: row, error } = await client
      .from(TABLE)
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.warn('CloudSaveService', 'Could not fetch cloud save; staying local-only', error);
      return;
    }

    this.cloudRowVersion = row?.updated_at ?? null;
    const cloud = row?.data ?? null;
    const local = this.saveManager.export();

    if (cloud && readUpdatedAt(cloud) > readUpdatedAt(local)) {
      logger.info('CloudSaveService', 'Cloud save is newer; adopting it');
      this.saveManager.import(cloud);
    } else {
      await this.push(user.id, local);
    }

    this.startSyncing();
  }

  private startSyncing(): void {
    this.stopSyncing();
    this.unsubscribeWrite = this.saveManager?.events.on('save:written', ({ data }) => {
      const user = authService.currentUser;
      if (user) void this.push(user.id, data);
    });
  }

  private stopSyncing(): void {
    this.unsubscribeWrite?.();
    this.unsubscribeWrite = undefined;
  }

  /**
   * Writes `data`, retrying once if another writer beat us to it.
   *
   * `attempt` bounds the retry to a single round: a second collision within
   * the same handful of milliseconds is rare enough that logging and letting
   * the next `save:written` event try again is a better trade than looping.
   */
  private async push(userId: string, data: unknown, attempt = 0): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    // No known row version yet (first sync for this account) — a plain
    // upsert is safe because there is nothing existing to race against.
    if (this.cloudRowVersion === null) {
      const { data: rows, error } = await client
        .from(TABLE)
        .upsert({ user_id: userId, data })
        .select('updated_at');
      if (error) {
        logger.warn('CloudSaveService', 'Could not push save to the cloud', error);
        return;
      }
      this.cloudRowVersion = rows?.[0]?.updated_at ?? this.cloudRowVersion;
      return;
    }

    const { data: rows, error } = await client
      .from(TABLE)
      .update({ data })
      .eq('user_id', userId)
      .eq('updated_at', this.cloudRowVersion)
      .select('updated_at');

    if (error) {
      logger.warn('CloudSaveService', 'Could not push save to the cloud', error);
      return;
    }

    if (rows && rows.length > 0) {
      this.cloudRowVersion = rows[0]?.updated_at ?? this.cloudRowVersion;
      return;
    }

    // Zero rows matched: the row moved since we last read it. Find out who
    // actually has the newer copy rather than assuming either side is right.
    if (attempt > 0) {
      logger.warn('CloudSaveService', 'Save push conflicted twice in a row; will retry later');
      return;
    }

    const { data: fresh, error: fetchError } = await client
      .from(TABLE)
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !fresh) {
      logger.warn('CloudSaveService', 'Could not resolve a save push conflict', fetchError);
      return;
    }

    this.cloudRowVersion = fresh.updated_at;

    if (readUpdatedAt(fresh.data) >= readUpdatedAt(data)) {
      // The row that beat us is newer than (or tied with) what we were about
      // to write. Adopting it — rather than forcing our stale copy back in —
      // is what actually stops progress from rolling backward.
      logger.info('CloudSaveService', 'Another session pushed a newer save; adopting it');
      this.saveManager?.import(fresh.data);
      return;
    }

    // Our copy is genuinely newer; retry now that the version stamp is current.
    await this.push(userId, data, attempt + 1);
  }
}

export const cloudSaveService = new CloudSaveService();
