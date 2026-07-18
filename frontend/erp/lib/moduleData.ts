import { ALL_SYNC_TYPES, getStaleTypes, refreshFromSheets, type RefreshResult } from "./sheetFetch";
import type { SheetType } from "./types";

/**
 * Which sheet types each module route needs before it can render meaningful
 * data: its own record tab(s) plus the master tabs its dropdowns read.
 * Opening a module fetches only these (and only the ones not fetched
 * recently — see getStaleTypes), instead of the old every-tab startup sweep.
 *
 * Masters are cheap, so lists err on the side of including them; `locations`
 * rides along wherever sheetConfig's cargo-source/vendor dropdowns render.
 */
export const MODULE_SHEET_TYPES: Record<string, SheetType[]> = {
  dashboard: [
    "cargo",
    "infra",
    "diesel",
    "trip-expense",
    "drivers",
    "vehicle-master",
    "vehicle-maintenance",
    "staff",
  ],
  cargo: [
    "cargo",
    "trip-expense",
    "diesel",
    "drivers",
    "materials",
    "locations",
    "vehicle-master",
    "vehicle-maintenance",
  ],
  infra: [
    "infra",
    "trip-expense",
    "diesel",
    "drivers",
    "clients",
    "locations",
    "vehicle-master",
    "vehicle-maintenance",
  ],
  diesel: ["diesel", "drivers", "vehicle-master", "vehicle-maintenance"],
  payroll: ["salary", "driver-expense", "drivers", "staff"],
  billing: ["bills", "cargo", "infra", "trip-expense", "clients"],
  drivers: ["drivers"],
  staff: ["staff"],
  ledger: ["ledger", "vehicle-master", "vehicle-maintenance"],
  materials: ["materials"],
  parties: ["locations"],
  vehicles: ["vehicle-master", "vehicle-maintenance", "drivers"],
  // Saved Records shows every tab, so it needs the full sweep.
  records: ALL_SYNC_TYPES,
};

/** The types a visit to `moduleId` would actually fetch right now (empty = everything's fresh, no fetch needed). */
export function staleModuleTypes(moduleId: string): SheetType[] {
  const types = MODULE_SHEET_TYPES[moduleId];
  return types ? getStaleTypes(types) : [];
}

/**
 * Fetches the stale subset of `moduleId`'s types. Callers should check
 * staleModuleTypes() first to decide whether to show a syncing indicator at
 * all; freshness stamping happens inside refreshFromSheets on success.
 */
export async function refreshModuleData(moduleId: string): Promise<RefreshResult> {
  const stale = staleModuleTypes(moduleId);
  if (stale.length === 0) return { success: true, message: "Already up to date." };
  return refreshFromSheets(stale);
}
