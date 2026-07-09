const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";

export function hasCloudSync(): boolean {
  return !!GAS_URL;
}

/** @deprecated use hasCloudSync() — mode is now always local+cloud when URL set */
export function isLocalStorageMode(): boolean {
  return !GAS_URL;
}

export function storageModeLabel(): string {
  return GAS_URL ? "Local + Google Sheets" : "Local (browser only)";
}
