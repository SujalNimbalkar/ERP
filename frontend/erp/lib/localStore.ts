import type { LocalRecord, SheetType, SubmitPayload } from "./types";

const STORAGE_KEY = "sahyadri_erp_records";

function readAll(): LocalRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: LocalRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function saveLocalRecord(payload: SubmitPayload): LocalRecord {
  const record: LocalRecord = {
    id: crypto.randomUUID(),
    type: payload.type,
    data: payload.data ?? {},
    savedAt: new Date().toISOString(),
  };
  const records = readAll();
  records.unshift(record);
  writeAll(records);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
  return record;
}

export function saveLocalRecords(payload: SubmitPayload): LocalRecord[] {
  const rows = payload.records ?? (payload.data ? [payload.data] : []);
  const savedAt = new Date().toISOString();
  const batch: LocalRecord[] = rows.map((row) => ({
    id: crypto.randomUUID(),
    type: payload.type,
    data: row,
    savedAt,
  }));
  const records = readAll();
  records.unshift(...batch);
  writeAll(records);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
  return batch;
}

export function getLocalRecords(): LocalRecord[] {
  return readAll();
}

export function getLocalRecordCount(): number {
  return readAll().length;
}

export function getLocalRecordsByType(type: SheetType): LocalRecord[] {
  return readAll().filter((r) => r.type === type);
}

export function clearLocalRecords() {
  localStorage.removeItem(STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
}

export function updateLocalRecord(
  id: string,
  newData: Record<string, string | number>
): boolean {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  records[idx] = { ...records[idx], data: newData };
  writeAll(records);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
  return true;
}

export function deleteLocalRecord(id: string): boolean {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  records.splice(idx, 1);
  writeAll(records);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
  return true;
}

export function exportLocalRecordsJson(): string {
  return JSON.stringify(readAll(), null, 2);
}

export function downloadLocalRecords() {
  const blob = new Blob([exportLocalRecordsJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sahyadri-erp-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
