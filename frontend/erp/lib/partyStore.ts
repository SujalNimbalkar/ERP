"use client";

import { appendAuditEntry } from "./auditLog";
import { syncMasterRecord } from "./api";

const CUSTOM_PARTY_KEY = "sahyadri_custom_parties";

export interface PartyEntry {
  id: string;
  name: string;
  notes: string;
  addedAt: string;
}

function readCustom(): PartyEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PARTY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PartyEntry[];
  } catch {
    return [];
  }
}

function writeCustom(entries: PartyEntry[]) {
  localStorage.setItem(CUSTOM_PARTY_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("sahyadri-party-update"));
}

export function getCustomParties(): PartyEntry[] {
  return readCustom();
}

/** Party names — used to extend the "To" destination options on Cargo/Pallet forms. */
export function getAllPartyNames(): string[] {
  return readCustom()
    .map((p) => p.name)
    .filter(Boolean);
}

/** Replaces the custom-party cache with rows fetched from Google Sheets. */
export function replaceWithSheetParties(rows: Record<string, unknown>[]): void {
  const entries: PartyEntry[] = rows
    .filter((row) => row.id && row.name)
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      notes: String(row.notes ?? ""),
      addedAt: String(row.addedAt ?? new Date().toISOString()),
    }));
  writeCustom(entries);
}

export function saveCustomParty(
  entry: Omit<PartyEntry, "addedAt"> & { addedAt?: string }
): PartyEntry {
  const previous = readCustom().find((p) => p.id === entry.id);
  const saved: PartyEntry = {
    ...entry,
    addedAt: previous?.addedAt ?? entry.addedAt ?? new Date().toISOString(),
  };
  const existing = readCustom().filter((p) => p.id !== entry.id);
  writeCustom([saved, ...existing]);
  void syncMasterRecord({ type: "parties", action: "upsert", data: saved as unknown as Record<string, unknown> });
  appendAuditEntry({
    action: previous ? "edit" : "create",
    recordType: "parties",
    recordId: saved.id,
    summary: `Party ${saved.name}`,
    before: (previous ?? {}) as unknown as Record<string, string | number>,
    after: saved as unknown as Record<string, string | number>,
  });
  return saved;
}

export function deleteCustomParty(id: string) {
  const removed = readCustom().find((p) => p.id === id);
  writeCustom(readCustom().filter((p) => p.id !== id));
  void syncMasterRecord({ type: "parties", action: "delete", id });
  if (removed) {
    appendAuditEntry({
      action: "delete",
      recordType: "parties",
      recordId: id,
      summary: `Deleted party ${removed.name}`,
      before: removed as unknown as Record<string, string | number>,
    });
  }
}
