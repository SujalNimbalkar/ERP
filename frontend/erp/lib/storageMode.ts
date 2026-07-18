/**
 * Whether cloud sync (Google Sheets via the server actions) is available.
 * The GAS URL is server-only now, so the client can't inspect env vars —
 * instead the (app) route-group layout computes the flag and AppChrome
 * seeds it here (synchronously, before any first render reads it).
 */
let cloudSync = false;

export function setCloudSyncFlag(value: boolean) {
  cloudSync = value;
}

export function hasCloudSync(): boolean {
  return cloudSync;
}

/** @deprecated use hasCloudSync() — mode is now always local+cloud when configured */
export function isLocalStorageMode(): boolean {
  return !cloudSync;
}

export function storageModeLabel(): string {
  return cloudSync ? "Local + Google Sheets" : "Local (browser only)";
}
