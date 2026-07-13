"use client";

import { appendAuditEntry } from "./auditLog";
import { syncMasterRecord } from "./api";

const LOCATION_KEY = "sahyadri_custom_locations";

export interface LocationEntry {
  id: string;
  name: string;
  /** Checked => also a Cargo Transport origin (gets its own tab-bar button). */
  isCargoPlant: boolean;
  /** Assigned once, the first time isCargoPlant becomes true — the stable
   * slug stored as `data.plantType` on its trips. Kept even if later
   * unchecked, so re-checking it doesn't mint a new slug and orphan old trips. */
  cargoType?: string;
  notes: string;
  addedAt: string;
  updatedAt?: string;
}

function readAll(): LocationEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocationEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: LocationEntry[]) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("sahyadri-location-update"));
}

export function getAllLocations(): LocationEntry[] {
  return readAll();
}

/** Locations flagged as Cargo Plants — each also acts as a Cargo Transport origin. */
export function getCargoSourceLocations(): LocationEntry[] {
  return readAll().filter((l) => l.isCargoPlant);
}

/** Destination-only location names — the direct replacement for the old getAllPartyNames(). */
export function getVendorOnlyNames(): string[] {
  return readAll()
    .filter((l) => !l.isCargoPlant)
    .map((l) => l.name)
    .filter(Boolean);
}

/** Turns a plant name into a unique slug, e.g. "New Plant" -> "cargo-new-plant". */
export function slugifyCargoSourceType(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cargo-${slug || "plant"}`;
}

function ensureCargoType(
  entry: LocationEntry,
  existingTypes: Set<string>
): LocationEntry {
  if (!entry.isCargoPlant || entry.cargoType) return entry;
  let candidate = slugifyCargoSourceType(entry.name);
  let suffix = 2;
  while (existingTypes.has(candidate)) {
    candidate = `${slugifyCargoSourceType(entry.name)}-${suffix}`;
    suffix += 1;
  }
  return { ...entry, cargoType: candidate };
}

/** Replaces the local location cache with rows fetched from Google Sheets. */
export function replaceWithSheetLocations(rows: Record<string, unknown>[]): void {
  const toStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const entries: LocationEntry[] = rows
    .filter((row) => row.id && row.name)
    .map((row) => ({
      id: toStr(row.id),
      name: toStr(row.name),
      isCargoPlant: toStr(row.isCargoPlant) === "true" || toStr(row.isCargoPlant) === "TRUE",
      cargoType: toStr(row.cargoType) || undefined,
      notes: toStr(row.notes),
      addedAt: toStr(row.addedAt) || new Date().toISOString(),
      updatedAt: toStr(row.updatedAt) || undefined,
    }));
  writeAll(entries);
}

function syncAndAudit(previous: LocationEntry | undefined, saved: LocationEntry) {
  void syncMasterRecord({
    type: "locations",
    action: "upsert",
    data: saved as unknown as Record<string, unknown>,
  });
  appendAuditEntry({
    action: previous ? "edit" : "create",
    recordType: "locations",
    recordId: saved.id,
    summary: `Location ${saved.name}${saved.isCargoPlant ? " (Cargo Plant)" : ""}`,
    before: (previous ?? {}) as unknown as Record<string, string | number>,
    after: saved as unknown as Record<string, string | number>,
  });
}

export function saveLocation(
  entry: Omit<LocationEntry, "addedAt"> & { addedAt?: string }
): LocationEntry {
  const all = readAll();
  const previous = all.find((l) => l.id === entry.id);
  const existingTypes = new Set(
    all.filter((l) => l.id !== entry.id && l.cargoType).map((l) => l.cargoType as string)
  );
  const saved = ensureCargoType(
    {
      ...entry,
      addedAt: previous?.addedAt ?? entry.addedAt ?? new Date().toISOString(),
    },
    existingTypes
  );
  writeAll([saved, ...all.filter((l) => l.id !== entry.id)]);
  syncAndAudit(previous, saved);
  return saved;
}

export function updateLocation(
  id: string,
  updates: Partial<Pick<LocationEntry, "name" | "isCargoPlant" | "notes">>
): LocationEntry | null {
  const all = readAll();
  const idx = all.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  const previous = all[idx];
  const existingTypes = new Set(
    all.filter((l) => l.id !== id && l.cargoType).map((l) => l.cargoType as string)
  );
  const merged = ensureCargoType(
    { ...previous, ...updates, updatedAt: new Date().toISOString() },
    existingTypes
  );
  const next = [...all];
  next[idx] = merged;
  writeAll(next);
  syncAndAudit(previous, merged);
  return merged;
}

export function deleteLocation(id: string) {
  const removed = readAll().find((l) => l.id === id);
  writeAll(readAll().filter((l) => l.id !== id));
  void syncMasterRecord({ type: "locations", action: "delete", id });
  if (removed) {
    appendAuditEntry({
      action: "delete",
      recordType: "locations",
      recordId: id,
      summary: `Deleted location ${removed.name}`,
      before: removed as unknown as Record<string, string | number>,
    });
  }
}
