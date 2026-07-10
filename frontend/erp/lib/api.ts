import type { ApiResponse, LocalRecord, MasterSyncPayload, SubmitPayload } from "./types";
import { markRecordsSynced, saveLocalRecord, saveLocalRecords } from "./localStore";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";

/**
 * Save form data locally first (always), then sync to Google Sheets if URL is configured.
 */
export async function submitToSheet(
  payload: SubmitPayload
): Promise<ApiResponse> {
  const rowCount = payload.records?.length ?? (payload.data ? 1 : 0);

  // Always save locally first — this stamps a sequential id into the row
  // data, which we then forward to the Sheet so both stay in sync.
  let localId = "";
  let outgoingPayload: SubmitPayload = payload;
  let savedIds: string[] = [];
  if (payload.records && payload.records.length > 0) {
    const saved = saveLocalRecords(payload);
    outgoingPayload = { type: payload.type, records: saved.map((r) => r.data) };
    savedIds = saved.map((r) => r.id);
  } else {
    const record = saveLocalRecord(payload);
    localId = record.id.slice(0, 8);
    outgoingPayload = { type: payload.type, data: record.data };
    savedIds = [record.id];
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
      body: JSON.stringify(outgoingPayload),
    });

    if (!response.ok) {
      markRecordsSynced(savedIds, false);
      return {
        success: true,
        message: localMsg + ` Sheet sync failed (${response.status}). You can retry from Saved Records.`,
        storage: "local",
      };
    }

    const result = (await response.json()) as ApiResponse;
    markRecordsSynced(savedIds, !!result.success);
    return {
      success: true,
      message: result.success
        ? rowCount > 1
          ? `Saved ${rowCount} rows to local + Sheets.`
          : "Saved to local + Google Sheets."
        : localMsg + ` Sheet sync: ${result.message} You can retry from Saved Records.`,
      storage: "remote",
    };
  } catch {
    markRecordsSynced(savedIds, false);
    return {
      success: true,
      message: localMsg + " Sheet sync failed (network error). You can retry from Saved Records.",
      storage: "local",
    };
  }
}

/**
 * Retries the Sheet sync for a single previously-saved local record (e.g.
 * one that failed while offline). Reuses the generic upsert mechanism —
 * matches an existing Sheet row by id, or inserts if none was ever created.
 */
export async function retrySync(record: LocalRecord): Promise<boolean> {
  if (typeof window === "undefined" || !GAS_URL) return false;
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: record.type, action: "upsert", data: record.data }),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as ApiResponse;
    if (!result.success) return false;
    markRecordsSynced([record.id], true);
    return true;
  } catch {
    return false;
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
