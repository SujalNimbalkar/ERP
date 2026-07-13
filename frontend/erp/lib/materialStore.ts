"use client";

import { MATERIAL_MASTER, type MaterialMasterEntry } from "./materialMaster";
import { appendAuditEntry } from "./auditLog";
import { syncMasterRecord } from "./api";

const CUSTOM_MATERIAL_KEY = "sahyadri_custom_materials";

export interface CustomMaterialEntry extends MaterialMasterEntry {
  isCustom: true;
  addedAt: string;
}

function readCustom(): CustomMaterialEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_MATERIAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomMaterialEntry[];
  } catch {
    return [];
  }
}

function writeCustom(entries: CustomMaterialEntry[]) {
  localStorage.setItem(CUSTOM_MATERIAL_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("sahyadri-material-update"));
}

export function getCustomMaterials(): CustomMaterialEntry[] {
  return readCustom();
}

/** Replaces the custom-material cache with rows fetched from Google Sheets. */
export function replaceWithSheetMaterials(rows: Record<string, unknown>[]): void {
  const entries: CustomMaterialEntry[] = rows
    .filter((row) => row.id && row.code)
    .map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name ?? ""),
      weightPerPieceKg:
        row.weightPerPieceKg === "" || row.weightPerPieceKg === undefined || row.weightPerPieceKg === null
          ? undefined
          : Number(row.weightPerPieceKg),
      ratePerKg:
        row.ratePerKg === "" || row.ratePerKg === undefined || row.ratePerKg === null
          ? undefined
          : Number(row.ratePerKg),
      isCustom: true,
      addedAt: String(row.addedAt ?? new Date().toISOString()),
    }));
  writeCustom(entries);
}

export function getAllMaterials(): (MaterialMasterEntry | CustomMaterialEntry)[] {
  return [...MATERIAL_MASTER, ...readCustom()];
}

export function saveCustomMaterial(
  entry: Omit<CustomMaterialEntry, "isCustom" | "addedAt">
): CustomMaterialEntry {
  const saved: CustomMaterialEntry = {
    ...entry,
    isCustom: true,
    addedAt: new Date().toISOString(),
  };
  const previous = readCustom().find((e) => e.id === entry.id);
  const existing = readCustom().filter((e) => e.id !== entry.id);
  writeCustom([saved, ...existing]);
  void syncMasterRecord({ type: "materials", action: "upsert", data: saved as unknown as Record<string, unknown> });
  appendAuditEntry({
    action: previous ? "edit" : "create",
    recordType: "materials",
    recordId: saved.id,
    summary: `Material ${saved.code} — ${saved.name}`,
    before: (previous ?? {}) as unknown as Record<string, string | number>,
    after: saved as unknown as Record<string, string | number>,
  });
  return saved;
}

export function deleteCustomMaterial(id: string) {
  const removed = readCustom().find((e) => e.id === id);
  writeCustom(readCustom().filter((e) => e.id !== id));
  void syncMasterRecord({ type: "materials", action: "delete", id });
  if (removed) {
    appendAuditEntry({
      action: "delete",
      recordType: "materials",
      recordId: id,
      summary: `Deleted material ${removed.code} — ${removed.name}`,
      before: removed as unknown as Record<string, string | number>,
    });
  }
}

/** Search custom first (allows overriding built-ins by code), then fall back to built-in list */
export function findMaterialByCodeAll(
  code: string
): MaterialMasterEntry | CustomMaterialEntry | undefined {
  const normalized = code.trim();
  return (
    readCustom().find((m) => m.code === normalized) ??
    MATERIAL_MASTER.find((m) => m.code === normalized)
  );
}
