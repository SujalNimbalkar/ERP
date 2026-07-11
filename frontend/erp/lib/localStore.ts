import type { LocalRecord, SheetType, SubmitPayload } from "./types";

const STORAGE_KEY = "sahyadri_erp_records";

/**
 * Sequential per-sheet id prefixes (e.g. H19-000123). `drivers` is
 * intentionally absent — it already has a stable business id (driverId).
 */
const ID_PREFIXES: Partial<Record<SheetType, string>> = {
  "cargo-h19": "H19",
  "cargo-j14": "J14",
  "cargo-j15-j16": "J1516",
  "cargo-matoshri": "MTS",
  "cargo-minerva": "MIN",
  "cargo-machine-shop": "MCS",
  infra: "INF",
  pallets: "PAL",
  diesel: "DSL",
  salary: "SAL",
  ledger: "LED",
};

function pad(n: number): string {
  return String(n).padStart(6, "0");
}

function getMaxSequence(type: SheetType, prefix: string): number {
  const match = `${prefix}-`;
  let max = 0;
  for (const record of getLocalRecordsByType(type)) {
    const id = record.data.id;
    if (typeof id !== "string" || !id.startsWith(match)) continue;
    const n = Number(id.slice(match.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function stampId(type: SheetType, row: Record<string, string | number>): Record<string, string | number> {
  const prefix = ID_PREFIXES[type];
  if (!prefix) return row;
  return { ...row, id: `${prefix}-${pad(getMaxSequence(type, prefix) + 1)}` };
}

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
    data: stampId(payload.type, payload.data ?? {}),
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
  const prefix = ID_PREFIXES[payload.type];
  const base = prefix ? getMaxSequence(payload.type, prefix) : 0;
  const batch: LocalRecord[] = rows.map((row, index) => ({
    id: crypto.randomUUID(),
    type: payload.type,
    data: prefix ? { ...row, id: `${prefix}-${pad(base + index + 1)}` } : row,
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

/**
 * Replaces the local cache with rows fetched from Google Sheets. Records
 * whose sync previously failed (`synced === false`) are kept — they only
 * exist locally and would otherwise be lost; they re-upload via retry.
 */
export function replaceWithSheetRecords(
  rowsByType: Partial<Record<SheetType, Record<string, string | number>[]>>
): void {
  const fetchedTypes = new Set(Object.keys(rowsByType) as SheetType[]);
  const savedAt = new Date().toISOString();
  const kept = readAll().filter(
    (r) => r.synced === false || !fetchedTypes.has(r.type)
  );
  const fetched: LocalRecord[] = (
    Object.entries(rowsByType) as [SheetType, Record<string, string | number>[]][]
  ).flatMap(([type, rows]) =>
    (rows ?? []).map((data) => ({
      id: crypto.randomUUID(),
      type,
      data,
      savedAt,
      synced: true,
    }))
  );
  writeAll([...kept, ...fetched]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
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

/** Records whose Sheet sync was attempted and failed — safe to retry. */
export function getPendingSyncRecords(): LocalRecord[] {
  return readAll().filter((r) => r.synced === false);
}

export function markRecordsSynced(ids: string[], synced: boolean): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const records = readAll();
  let changed = false;
  const updated = records.map((r) => {
    if (!idSet.has(r.id)) return r;
    changed = true;
    return { ...r, synced };
  });
  if (!changed) return;
  writeAll(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-local-update"));
  }
}

/**
 * Finds records anywhere in local storage whose Invoice/DC No (documentNo or dcNo)
 * matches the given value, case-insensitively. Used to enforce that invoice/DC
 * numbers are unique across the whole database, not just within one sheet.
 */
export function findRecordsByDocumentNo(
  documentNo: string,
  excludeId?: string
): LocalRecord[] {
  const value = documentNo.trim().toLowerCase();
  if (!value) return [];
  return readAll().filter((r) => {
    if (r.id === excludeId) return false;
    const docNo = r.data.documentNo ?? r.data.dcNo;
    return docNo !== undefined && String(docNo).trim().toLowerCase() === value;
  });
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
