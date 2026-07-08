import type { ApiResponse, SubmitPayload } from "./types";
import { saveLocalRecord, saveLocalRecords } from "./localStore";
import { getStorageMode } from "./storageMode";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";

/**
 * Save form data — locally in the browser by default until Google Sheets is ready.
 * Set NEXT_PUBLIC_GAS_WEB_APP_URL + NEXT_PUBLIC_STORAGE_MODE=remote to use Sheets.
 */
export async function submitToSheet(
  payload: SubmitPayload
): Promise<ApiResponse> {
  const mode = getStorageMode();
  const rowCount = payload.records?.length ?? (payload.data ? 1 : 0);

  if (mode === "local") {
    if (payload.records && payload.records.length > 0) {
      const records = saveLocalRecords(payload);
      return {
        success: true,
        message: `Saved ${records.length} rows locally. Data stays in this browser until you export or connect Google Sheets.`,
        storage: "local",
      };
    }

    const record = saveLocalRecord(payload);
    return {
      success: true,
      message: `Saved locally (${record.id.slice(0, 8)}…). Data stays in this browser until you export or connect Google Sheets.`,
      storage: "local",
    };
  }

  if (!GAS_URL) {
    return {
      success: false,
      message:
        "Remote mode requires NEXT_PUBLIC_GAS_WEB_APP_URL in .env.local",
    };
  }

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return {
      success: false,
      message: `Request failed (${response.status})`,
    };
  }

  const result = (await response.json()) as ApiResponse;
  return {
    ...result,
    message: result.success && rowCount > 1 ? `Saved ${rowCount} rows.` : result.message,
    storage: "remote",
  };
}
