import { listSheets } from "@/app/actions/sheets";
import { hasCloudSync } from "./storageMode";
import { replaceWithSheetRecords } from "./localStore";
import { replaceWithSheetVehicles } from "./vehicleStore";
import { replaceWithSheetMaterials } from "./materialStore";
import { replaceWithSheetBills, replaceWithSheetInfraBills } from "./billingStore";
import { replaceWithSheetLocations } from "./locationStore";
import { replaceWithSheetStaff } from "./staffStore";
import { replaceWithSheetClients } from "./clientStore";
import type { AuditEntry } from "./auditLog";
import type { SheetType } from "./types";

/**
 * Pull-side of the Google Sheets sync: the Sheet is the source of truth,
 * localStorage is a cache. `refreshFromSheets` fetches tabs through the
 * `listSheets` server action (the browser never talks to Apps Script
 * directly) and replaces the local caches, so data entered on any device
 * appears everywhere. Called with a module's type subset when a route is
 * opened, and with no argument (= every tab) from the sidebar's Refresh
 * button and the Saved Records refresh.
 */

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
  "trip-expense",
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
  "trip-expense": "Trip Expenses",
  materials: "Materials",
  "vehicle-master": "Vehicles",
  "vehicle-maintenance": "Maintenance",
  bills: "Bills",
  locations: "Plants & Vendors",
  staff: "Staff",
  clients: "Client Companies",
};

/** Every type the full (no-argument) refresh sweeps — record tabs + masters. */
export const ALL_SYNC_TYPES: SheetType[] = [
  ...RECORD_TYPES,
  "locations",
  "vehicle-master",
  "vehicle-maintenance",
  "materials",
  "bills",
  "staff",
  "clients",
];

/**
 * Per-type freshness registry (in-memory, resets on page reload). Stamped on
 * every successful refresh — partial or full — so module navigation can skip
 * types fetched recently. 5 minutes sits comfortably above the server
 * action's 60s cache window.
 */
const STALE_MS = 5 * 60_000;
const lastTypeFetch = new Map<SheetType, number>();

/** The subset of `types` that has never been fetched this session or is older than the staleness window. */
export function getStaleTypes(types: SheetType[]): SheetType[] {
  const now = Date.now();
  return types.filter((t) => now - (lastTypeFetch.get(t) ?? 0) > STALE_MS);
}

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

export async function refreshFromSheets(types?: SheetType[]): Promise<RefreshResult> {
  if (!hasCloudSync()) {
    return { success: false, message: "Google Sheets is not configured." };
  }
  // The vehicle stores are replaced as an atomic pair (one replace function
  // takes both arrays) — requesting one without the other would wipe the
  // missing half, so the pair is always completed here.
  const requested = types ? new Set(types) : null;
  if (requested?.has("vehicle-master") || requested?.has("vehicle-maintenance")) {
    requested.add("vehicle-master");
    requested.add("vehicle-maintenance");
  }
  const wants = (type: SheetType) => !requested || requested.has(type);

  let json: ListResponse;
  try {
    json = (await listSheets(requested ? [...requested] : undefined)) as ListResponse;
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
  if (wants("locations") && !missingTypes.has("locations")) {
    replaceWithSheetLocations(data["locations"] ?? []);
  }

  // Only types whose tab was actually found are included here — omitting a
  // type's key entirely makes `replaceWithSheetRecords` leave its existing
  // local records untouched (see its "kept" logic in localStore.ts). The same
  // omission mechanism handles types outside a partial refresh's subset.
  const recordRows: Partial<Record<SheetType, SheetRow[]>> = {};
  for (const type of RECORD_TYPES) {
    if (!wants(type) || missingTypes.has(type)) continue;
    recordRows[type] = Array.isArray(data[type]) ? data[type] : [];
  }
  replaceWithSheetRecords(recordRows);

  if (
    wants("vehicle-master") &&
    !missingTypes.has("vehicle-master") &&
    !missingTypes.has("vehicle-maintenance")
  ) {
    replaceWithSheetVehicles(data["vehicle-master"] ?? [], data["vehicle-maintenance"] ?? []);
  }
  if (wants("materials") && !missingTypes.has("materials")) {
    replaceWithSheetMaterials(data["materials"] ?? []);
  }
  if (wants("bills") && !missingTypes.has("bills")) {
    replaceWithSheetBills(data["bills"] ?? []);
    replaceWithSheetInfraBills(data["bills"] ?? []);
  }
  if (wants("staff") && !missingTypes.has("staff")) {
    replaceWithSheetStaff(data["staff"] ?? []);
  }
  if (wants("clients") && !missingTypes.has("clients")) {
    replaceWithSheetClients(data["clients"] ?? []);
  }

  // Stamp freshness for what was actually fetched (missing tabs included —
  // re-fetching a tab that doesn't exist won't make it appear).
  const stampedAt = Date.now();
  for (const type of requested ?? ALL_SYNC_TYPES) {
    lastTypeFetch.set(type, stampedAt);
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
  if (!hasCloudSync()) return null;
  try {
    const json = (await listSheets(["audit"])) as ListResponse;
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
        user: String(row.user ?? ""),
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
