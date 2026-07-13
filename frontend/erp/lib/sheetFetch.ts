import { replaceWithSheetRecords } from "./localStore";
import { replaceWithSheetVehicles } from "./vehicleStore";
import { replaceWithSheetMaterials } from "./materialStore";
import { replaceWithSheetBills } from "./billingStore";
import { replaceWithSheetLocations } from "./locationStore";
import { replaceWithSheetStaff } from "./staffStore";
import type { AuditEntry } from "./auditLog";
import type { SheetType } from "./types";

/**
 * Pull-side of the Google Sheets sync: the Sheet is the source of truth,
 * localStorage is a cache. `refreshFromSheets` fetches every tab through the
 * Apps Script `?action=list` API and replaces the local caches, so data
 * entered on any device appears everywhere. Called on app start and from the
 * sidebar's Refresh button.
 */

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";
const LAST_FETCH_KEY = "sahyadri_last_sheet_fetch";

/** Types that live in the shared records store (one row = one form entry).
 * Every Cargo plant shares the single "cargo" type/tab (see `plantType` on
 * each row) — there's no per-plant type to enumerate anymore. */
const RECORD_TYPES: SheetType[] = [
  "cargo",
  "infra",
  "pallets",
  "diesel",
  "drivers",
  "salary",
  "driver-expense",
  "ledger",
];

/** Short labels for the per-tab row counts in the refresh message. */
const TYPE_LABELS: Record<string, string> = {
  cargo: "Cargo Trips",
  infra: "Infra",
  pallets: "Pallets",
  diesel: "Diesel",
  drivers: "Drivers",
  salary: "Salary",
  "driver-expense": "Driver Expenses",
  ledger: "Ledger",
  materials: "Materials",
  "vehicle-master": "Vehicles",
  "vehicle-maintenance": "Maintenance",
  bills: "Bills",
  locations: "Plants & Vendors",
  staff: "Staff",
};

type SheetRow = Record<string, string | number>;
type ListResponse = {
  success: boolean;
  message?: string;
  data?: Record<string, SheetRow[]>;
  /** Human-readable tab names not found in the spreadsheet — for the status message. */
  missing?: string[];
  /** Type keys whose tab wasn't found — used to skip overwriting their local cache. */
  missingTypes?: string[];
};

export interface RefreshResult {
  success: boolean;
  message: string;
}

export async function refreshFromSheets(): Promise<RefreshResult> {
  if (!GAS_URL) {
    return { success: false, message: "Google Sheets is not configured." };
  }
  let json: ListResponse;
  try {
    const response = await fetch(`${GAS_URL}?action=list`);
    if (!response.ok) {
      return { success: false, message: `Google Sheets fetch failed (${response.status}).` };
    }
    json = (await response.json()) as ListResponse;
  } catch {
    return { success: false, message: "Network error fetching from Google Sheets." };
  }
  if (!json.success || !json.data) {
    return { success: false, message: json.message ?? "Google Sheets fetch failed." };
  }

  const data = json.data;
  // A tab that wasn't found in the spreadsheet is NOT the same as "confirmed
  // zero rows" — treating it that way would silently wipe local data (e.g. a
  // custom plant/vendor/staff member added before its tab was created).
  // `missingTypes` types are skipped below so their local cache is left alone.
  const missingTypes = new Set(json.missingTypes ?? []);

  // Refresh the custom locations list (plants + vendors) so dropdowns stay current.
  if (!missingTypes.has("locations")) {
    replaceWithSheetLocations(data["locations"] ?? []);
  }

  // Only types whose tab was actually found are included here — omitting a
  // type's key entirely makes `replaceWithSheetRecords` leave its existing
  // local records untouched (see its "kept" logic in localStore.ts).
  const recordRows: Partial<Record<SheetType, SheetRow[]>> = {};
  for (const type of RECORD_TYPES) {
    if (missingTypes.has(type)) continue;
    recordRows[type] = Array.isArray(data[type]) ? data[type] : [];
  }
  replaceWithSheetRecords(recordRows);

  if (!missingTypes.has("vehicle-master") && !missingTypes.has("vehicle-maintenance")) {
    replaceWithSheetVehicles(data["vehicle-master"] ?? [], data["vehicle-maintenance"] ?? []);
  }
  if (!missingTypes.has("materials")) {
    replaceWithSheetMaterials(data["materials"] ?? []);
  }
  if (!missingTypes.has("bills")) {
    replaceWithSheetBills(data["bills"] ?? []);
  }
  if (!missingTypes.has("staff")) {
    replaceWithSheetStaff(data["staff"] ?? []);
  }

  const counts = Object.entries(data)
    .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
    .map(([type, rows]) => `${TYPE_LABELS[type] ?? type} ${rows.length}`)
    .join(", ");
  const rowCount = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  const missingNote =
    json.missing && json.missing.length > 0
      ? ` Tabs not found in the spreadsheet: ${json.missing.join(", ")} — local data for these was kept, not overwritten.`
      : "";
  localStorage.setItem(LAST_FETCH_KEY, new Date().toISOString());
  return {
    success: true,
    message:
      `Loaded ${rowCount} row(s) from Google Sheets${counts ? ` (${counts})` : ""}.` +
      missingNote,
  };
}

export function getLastSheetFetch(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_FETCH_KEY);
}

/**
 * Full audit history from the spreadsheet's Audit Log tab (excluded from the
 * startup sweep because it grows large). Returns null on failure so callers
 * can fall back to the local recent cache.
 */
export async function fetchAuditLog(): Promise<AuditEntry[] | null> {
  if (!GAS_URL) return null;
  try {
    const response = await fetch(`${GAS_URL}?action=list&type=audit`);
    if (!response.ok) return null;
    const json = (await response.json()) as ListResponse;
    if (!json.success || !Array.isArray(json.data?.audit)) return null;
    return json.data.audit
      .filter((row) => row.id)
      .map((row) => ({
        id: String(row.id),
        timestamp: String(row.timestamp ?? ""),
        action: (String(row.action) as AuditEntry["action"]) || "edit",
        recordType: String(row.recordType ?? ""),
        recordId: String(row.recordId ?? ""),
        documentNo: String(row.documentNo ?? ""),
        summary: String(row.summary ?? ""),
        before: parseJsonCell(row.beforeJson),
        after: row.afterJson ? parseJsonCell(row.afterJson) : undefined,
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return null;
  }
}

function parseJsonCell(value: string | number | undefined): Record<string, string | number> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value) as Record<string, string | number>;
  } catch {
    return {};
  }
}
