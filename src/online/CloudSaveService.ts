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
 */
export class CloudSaveService {
  private saveManager?: SaveManager;
  private unsubscribeWrite?: () => void;

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

    const { data, error } = await client
      .from(TABLE)
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.warn('CloudSaveService', 'Could not fetch cloud save; staying local-only', error);
      return;
    }

    const cloud = data?.data ?? null;
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

  private async push(userId: string, data: unknown): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client.from(TABLE).upsert({ user_id: userId, data });
    if (error) logger.warn('CloudSaveService', 'Could not push save to the cloud', error);
  }
}

export const cloudSaveService = new CloudSaveService();
