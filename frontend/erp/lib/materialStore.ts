"use client";

import { MATERIAL_MASTER, type MaterialMasterEntry } from "./materialMaster";

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
  const existing = readCustom().filter((e) => e.id !== entry.id);
  writeCustom([saved, ...existing]);
  return saved;
}

export function deleteCustomMaterial(id: string) {
  writeCustom(readCustom().filter((e) => e.id !== id));
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
