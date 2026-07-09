import type { ApiResponse, MasterSyncPayload, SubmitPayload } from "./types";
import { saveLocalRecord, saveLocalRecords } from "./localStore";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";

/**
 * Save form data locally first (always), then sync to Google Sheets if URL is configured.
 */
export async function submitToSheet(
  payload: SubmitPayload
): Promise<ApiResponse> {
  const rowCount = payload.records?.length ?? (payload.data ? 1 : 0);

  // Always save locally first
  let localId = "";
  if (payload.records && payload.records.length > 0) {
    saveLocalRecords(payload);
  } else {
    const record = saveLocalRecord(payload);
    localId = record.id.slice(0, 8);
  }

  const localMsg =
    rowCount > 1
      ? `Saved ${rowCount} rows locally.`
      : `Saved locally (${localId}…).`;

  if (!GAS_URL) {
    return {
      success: true,
      message: localMsg + " Connect Google Sheets for cloud backup.",
      storage: "local",
    };
  }

  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: true,
        message: localMsg + ` Sheet sync failed (${response.status}).`,
        storage: "local",
      };
    }

    const result = (await response.json()) as ApiResponse;
    return {
      success: true,
      message: result.success
        ? rowCount > 1
          ? `Saved ${rowCount} rows to local + Sheets.`
          : "Saved to local + Google Sheets."
        : localMsg + ` Sheet sync: ${result.message}`,
      storage: "remote",
    };
  } catch {
    return {
      success: true,
      message: localMsg + " Sheet sync failed (network error).",
      storage: "local",
    };
  }
}

/**
 * Fire-and-forget sync for master records (Vehicle, Maintenance, Material).
 * localStorage is already updated by the store before this is called.
 */
export async function syncMasterRecord(
  payload: MasterSyncPayload
): Promise<void> {
  if (typeof window === "undefined" || !GAS_URL) return;
  try {
    await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  } catch {
    // intentional no-op — localStorage is the primary store
  }
}
