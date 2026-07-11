import { replaceWithSheetRecords } from "./localStore";
import { replaceWithSheetVehicles } from "./vehicleStore";
import { replaceWithSheetMaterials } from "./materialStore";
import { replaceWithSheetBills } from "./billingStore";
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

/** Types that live in the shared records store (one row = one form entry). */
const RECORD_TYPES: SheetType[] = [
  "cargo-h19",
  "cargo-j14",
  "cargo-j15-j16",
  "cargo-matoshri",
  "cargo-minerva",
  "cargo-machine-shop",
  "infra",
  "pallets",
  "diesel",
  "drivers",
  "salary",
  "ledger",
];

/** Short labels for the per-tab row counts in the refresh message. */
const TYPE_LABELS: Record<string, string> = {
  "cargo-h19": "H19",
  "cargo-j14": "J14",
  "cargo-j15-j16": "J15-J16",
  "cargo-matoshri": "Matoshri",
  "cargo-minerva": "Minerva",
  "cargo-machine-shop": "Machine Shop",
  infra: "Infra",
  pallets: "Pallets",
  diesel: "Diesel",
  drivers: "Drivers",
  salary: "Salary",
  ledger: "Ledger",
  materials: "Materials",
  "vehicle-master": "Vehicles",
  "vehicle-maintenance": "Maintenance",
  bills: "Bills",
};

type SheetRow = Record<string, string | number>;
type ListResponse = {
  success: boolean;
  message?: string;
  data?: Record<string, SheetRow[]>;
  missing?: string[];
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
  // Every type is replaced, present in the response or not — the Sheet is
  // the only data source, so a missing tab means that type has no rows.
  const recordRows: Partial<Record<SheetType, SheetRow[]>> = {};
  for (const type of RECORD_TYPES) {
    recordRows[type] = Array.isArray(data[type]) ? data[type] : [];
  }
  replaceWithSheetRecords(recordRows);
  replaceWithSheetVehicles(data["vehicle-master"] ?? [], data["vehicle-maintenance"] ?? []);
  replaceWithSheetMaterials(data["materials"] ?? []);
  replaceWithSheetBills(data["bills"] ?? []);

  const counts = Object.entries(data)
    .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
    .map(([type, rows]) => `${TYPE_LABELS[type] ?? type} ${rows.length}`)
    .join(", ");
  const rowCount = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  const missingNote =
    json.missing && json.missing.length > 0
      ? ` Tabs not found in the spreadsheet: ${json.missing.join(", ")}.`
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
