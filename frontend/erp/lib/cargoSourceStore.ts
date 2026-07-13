"use client";

import { appendAuditEntry } from "./auditLog";
import { syncMasterRecord } from "./api";

const CUSTOM_CARGO_SOURCE_KEY = "sahyadri_custom_cargo_sources";

export interface CustomCargoSource {
  /** Unique slug, e.g. "cargo-new-plant" — used as the SheetType/tab key */
  type: string;
  label: string;
  /** Google Sheet tab name this source's trips are written to */
  sheetTab: string;
  addedAt: string;
}

function readCustom(): CustomCargoSource[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CARGO_SOURCE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomCargoSource[];
  } catch {
    return [];
  }
}

function writeCustom(sources: CustomCargoSource[]) {
  localStorage.setItem(CUSTOM_CARGO_SOURCE_KEY, JSON.stringify(sources));
  window.dispatchEvent(new Event("sahyadri-cargo-source-update"));
}

export function getCustomCargoSources(): CustomCargoSource[] {
  return readCustom();
}

/** Replaces the custom-cargo-source cache with rows fetched from Google Sheets. */
export function replaceWithSheetCargoSources(rows: Record<string, unknown>[]): void {
  const entries: CustomCargoSource[] = rows
    .filter((row) => row.type && row.label && row.sheetTab)
    .map((row) => ({
      type: String(row.type),
      label: String(row.label),
      sheetTab: String(row.sheetTab),
      addedAt: String(row.addedAt ?? new Date().toISOString()),
    }));
  writeCustom(entries);
}

/** Turns a plant label into a unique slug for its SheetType key, e.g. "New Plant" -> "cargo-new-plant". */
export function slugifyCargoSourceType(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cargo-${slug || "plant"}`;
}

export function saveCustomCargoSource(
  entry: Omit<CustomCargoSource, "addedAt"> & { addedAt?: string }
): CustomCargoSource {
  const previous = readCustom().find((s) => s.type === entry.type);
  const saved: CustomCargoSource = {
    ...entry,
    addedAt: previous?.addedAt ?? entry.addedAt ?? new Date().toISOString(),
  };
  const existing = readCustom().filter((s) => s.type !== entry.type);
  writeCustom([saved, ...existing]);
  void syncMasterRecord({
    type: "cargo-sources",
    action: "upsert",
    data: saved as unknown as Record<string, unknown>,
  });
  appendAuditEntry({
    action: previous ? "edit" : "create",
    recordType: "cargo-sources",
    recordId: saved.type,
    summary: `Cargo plant ${saved.label} (${saved.sheetTab})`,
    before: (previous ?? {}) as unknown as Record<string, string | number>,
    after: saved as unknown as Record<string, string | number>,
  });
  return saved;
}

export function deleteCustomCargoSource(type: string) {
  const removed = readCustom().find((s) => s.type === type);
  writeCustom(readCustom().filter((s) => s.type !== type));
  void syncMasterRecord({ type: "cargo-sources", action: "delete", id: type });
  if (removed) {
    appendAuditEntry({
      action: "delete",
      recordType: "cargo-sources",
      recordId: type,
      summary: `Deleted cargo plant ${removed.label}`,
      before: removed as unknown as Record<string, string | number>,
    });
  }
}
