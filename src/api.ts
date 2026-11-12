import { callable } from '@decky/api';
import {
  ApplyResult,
  CheatPack,
  CheatState,
  Result,
  RunningGame,
  StoreIndex,
} from './types';

export const getRunningGame = callable<[], RunningGame | null>('get_running_game');
export const getDownloadedPacks = callable<[], CheatPack[]>('get_downloaded_packs');
export const getCheatStates = callable<[packId: string], CheatState[]>('get_cheat_states');
export const setCheatState = callable<
  [packId: string, cheatId: string, enabled: boolean, value: string | number | null],
  ApplyResult
>('set_cheat_state');
export const readCheatValues = callable<[packId: string], Record<string, number | string>>(
  'read_cheat_values',
);
export const getAppArt = callable<[appId: string], { header: string; capsule: string }>('get_app_art');
export const deletePack = callable<[packId: string], Result>('delete_pack');
export const getStoreIndex = callable<[forceRefresh: boolean], StoreIndex>('get_store_index');
export const downloadPack = callable<
  [storeEntryId: string, downloadUrl: string],
  Result & { source?: string }
>('download_pack');

/** Compare dotted version strings; >0 if a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// One lookup per game per session; components share the same promise.
const artCache = new Map<string, Promise<{ header: string; capsule: string }>>();
export function loadAppArt(appId: string) {
  let p = artCache.get(appId);
  if (!p) {
    p = getAppArt(appId).catch(() => ({
      header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      capsule: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_184x69.jpg`,
    }));
    artCache.set(appId, p);
  }
  return p;
}
