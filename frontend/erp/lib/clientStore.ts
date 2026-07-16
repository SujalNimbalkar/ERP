"use client";

import { appendAuditEntry } from "./auditLog";
import { syncMasterRecord } from "./api";

/**
 * Client Company master for Infra & Crusher billing — one row per client +
 * project/site combo (a client with two sites is two rows sharing the same
 * name/address/GST). Flat list, same shape as locationStore.ts, so the
 * Infra & Crusher form can pick an existing client/project or add a new one
 * inline without any join logic.
 */

const CLIENT_KEY = "sahyadri_custom_clients";
const CLIENT_UPDATE_EVENT = "sahyadri-client-update";

export interface ClientEntry {
  id: string;
  name: string;
  address: string;
  gstNo: string;
  shippingName: string;
  shippingAddress: string;
  projectCode: string;
  projectName: string;
  notes: string;
  addedAt: string;
  updatedAt?: string;
}

function readAll(): ClientEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLIENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClientEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: ClientEntry[]) {
  localStorage.setItem(CLIENT_KEY, JSON.stringify(entries));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLIENT_UPDATE_EVENT));
  }
}

export function getAllClients(): ClientEntry[] {
  return readAll();
}

export function findClientById(id: string): ClientEntry | undefined {
  return readAll().find((c) => c.id === id);
}

/** Most recently added row with this client name — used to prefill a new
 * project/site row for a client that already exists. */
export function findClientDefaultsByName(name: string): ClientEntry | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return readAll().find((c) => c.name.trim().toLowerCase() === normalized);
}

/** {value, label} pairs for the Client / Project picker, sorted by name. */
export function getClientOptions(): { value: string; label: string }[] {
  return readAll()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      value: c.id,
      label: [c.name, [c.projectCode, c.projectName].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — "),
    }));
}

/** Replaces the local client cache with rows fetched from Google Sheets. */
export function replaceWithSheetClients(rows: Record<string, unknown>[]): void {
  const toStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const entries: ClientEntry[] = rows
    .filter((row) => row.id && row.name)
    .map((row) => ({
      id: toStr(row.id),
      name: toStr(row.name),
      address: toStr(row.address),
      gstNo: toStr(row.gstNo),
      shippingName: toStr(row.shippingName),
      shippingAddress: toStr(row.shippingAddress),
      projectCode: toStr(row.projectCode),
      projectName: toStr(row.projectName),
      notes: toStr(row.notes),
      addedAt: toStr(row.addedAt) || new Date().toISOString(),
      updatedAt: toStr(row.updatedAt) || undefined,
    }));
  writeAll(entries);
}

export function saveClient(
  entry: Omit<ClientEntry, "addedAt"> & { addedAt?: string }
): ClientEntry {
  const all = readAll();
  const previous = all.find((c) => c.id === entry.id);
  const saved: ClientEntry = {
    ...entry,
    addedAt: previous?.addedAt ?? entry.addedAt ?? new Date().toISOString(),
    updatedAt: previous ? new Date().toISOString() : undefined,
  };
  writeAll([saved, ...all.filter((c) => c.id !== entry.id)]);
  void syncMasterRecord({
    type: "clients",
    action: "upsert",
    data: saved as unknown as Record<string, unknown>,
  });
  appendAuditEntry({
    action: previous ? "edit" : "create",
    recordType: "clients",
    recordId: saved.id,
    summary: `Client ${saved.name}${saved.projectCode ? ` — ${saved.projectCode}` : ""}`,
    before: (previous ?? {}) as unknown as Record<string, string | number>,
    after: saved as unknown as Record<string, string | number>,
  });
  return saved;
}

export function deleteClient(id: string) {
  const removed = readAll().find((c) => c.id === id);
  writeAll(readAll().filter((c) => c.id !== id));
  void syncMasterRecord({ type: "clients", action: "delete", id });
  if (removed) {
    appendAuditEntry({
      action: "delete",
      recordType: "clients",
      recordId: id,
      summary: `Deleted client ${removed.name}`,
      before: removed as unknown as Record<string, string | number>,
    });
  }
}

export function onClientsUpdate(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CLIENT_UPDATE_EVENT, handler);
  return () => window.removeEventListener(CLIENT_UPDATE_EVENT, handler);
}
