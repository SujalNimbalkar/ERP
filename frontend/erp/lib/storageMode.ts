export type StorageMode = "local" | "remote";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";
const MODE_ENV = process.env.NEXT_PUBLIC_STORAGE_MODE ?? "auto";

/** local = browser only · remote = Google Sheets · auto = local when no URL configured */
export function getStorageMode(): StorageMode {
  if (MODE_ENV === "local") return "local";
  if (MODE_ENV === "remote") return "remote";
  return GAS_URL ? "remote" : "local";
}

export function isLocalStorageMode(): boolean {
  return getStorageMode() === "local";
}

export function storageModeLabel(): string {
  return getStorageMode() === "local" ? "Local (browser)" : "Google Sheets";
}
