import type { ApiResponse, LocalRecord, MasterSyncPayload, SubmitPayload } from "./types";
import { appendRows, deleteRow, upsertRow } from "@/app/actions/sheets";
import { appendAuditEntry } from "./auditLog";
import { hasCloudSync } from "./storageMode";
import { markRecordsSynced, saveLocalRecord, saveLocalRecords } from "./localStore";

/** One audit entry per form submission (not per material line). */
function auditFormSubmission(type: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const docNos = Array.from(
    new Set(rows.map((r) => String(r.documentNo ?? r.dcNo ?? "")).filter(Boolean))
  );
  const plantType = rows[0].plantType ? ` (${rows[0].plantType})` : "";
  appendAuditEntry({
    action: "create",
    recordType: type,
    recordId: String(rows[0].id ?? ""),
    documentNo: docNos.join(", "),
    summary: `${rows.length} row(s) saved to ${type}${plantType}`,
    before: {},
    after: rows[0],
  });
}

/**
 * Save form data locally first (always), then sync to Google Sheets via the
 * appendRows server action when cloud sync is configured.
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

  auditFormSubmission(
    payload.type,
    outgoingPayload.records ?? (outgoingPayload.data ? [outgoingPayload.data] : [])
  );

  const localMsg =
    rowCount > 1
      ? `Saved ${rowCount} rows locally.`
      : `Saved locally (${localId}…).`;

  if (!hasCloudSync()) {
    return {
      success: true,
      message: localMsg + " Connect Google Sheets for cloud backup.",
      storage: "local",
    };
  }

  try {
    const rows = outgoingPayload.records ?? (outgoingPayload.data ? [outgoingPayload.data] : []);
    const result = await appendRows(outgoingPayload.type, rows);
    markRecordsSynced(savedIds, result.success);
    return {
      success: true,
      message: result.success
        ? rowCount > 1
          ? `Saved ${rowCount} rows to local + Sheets.`
          : "Saved to local + Google Sheets."
        : localMsg + ` Sheet sync: ${result.message} You can retry from Saved Records.`,
      storage: result.success ? "remote" : "local",
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
  if (typeof window === "undefined" || !hasCloudSync()) return false;
  try {
    const result = await upsertRow(record.type, record.data);
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
  if (typeof window === "undefined" || !hasCloudSync()) return;
  try {
    if (payload.action === "delete") {
      await deleteRow(payload.type, String(payload.id ?? ""));
    } else {
      await upsertRow(
        payload.type,
        (payload.data ?? {}) as Record<string, string | number>
      );
    }
  } catch {
    // intentional no-op — localStorage is the primary store
  }
}
