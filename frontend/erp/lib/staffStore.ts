"use client";

import { appendAuditEntry } from "./auditLog";
import { syncMasterRecord } from "./api";
import { getDriverOptions } from "./driverStore";

const STAFF_KEY = "sahyadri_staff_master";

export const STAFF_ROLES = ["Accountant", "Hamal", "Admin", "Other"] as const;

export interface StaffRecord {
  id: string;
  name: string;
  role: string;
  mobileNumber: string;
  /** Monthly salary (Accountant) or daily wage (Hamal) — meaning depends on role. */
  rate: string;
  notes: string;
  addedAt: string;
  updatedAt: string;
  /** The email the admin uses to create this person's login in the Firebase console. */
  email: string;
}

export interface StaffOption {
  value: string;
  label: string;
  name: string;
  rate: string;
}

function readAll(): StaffRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StaffRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: StaffRecord[]) {
  localStorage.setItem(STAFF_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event("sahyadri-staff-update"));
}

export function getAllStaff(): StaffRecord[] {
  return readAll();
}

export function getStaffById(id: string): StaffRecord | undefined {
  return readAll().find((s) => s.id === id);
}

/** Finds the staff record whose email matches a signed-in session email (case-insensitive). */
export function getStaffByEmail(email: string): StaffRecord | undefined {
  const target = email.trim().toLowerCase();
  if (!target) return undefined;
  return readAll().find((s) => (s.email ?? "").trim().toLowerCase() === target);
}

export function getStaffOptions(): StaffOption[] {
  return readAll().map((s) => ({
    value: s.id,
    label: `${s.id} - ${s.name} (${s.role})`,
    name: s.name,
    rate: s.rate,
  }));
}

export function getNextStaffId(): string {
  const ids = readAll()
    .map((s) => Number(s.id.replace(/^STF-/, "")))
    .filter((n) => Number.isFinite(n));
  return `STF-${String((ids.length ? Math.max(...ids) : 0) + 1).padStart(3, "0")}`;
}

/** Replaces the local staff cache with rows fetched from Google Sheets. */
export function replaceWithSheetStaff(rows: Record<string, unknown>[]): void {
  const toStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const entries: StaffRecord[] = rows
    .filter((row) => row.id && row.name)
    .map((row) => ({
      id: toStr(row.id),
      name: toStr(row.name),
      role: toStr(row.role),
      mobileNumber: toStr(row.mobileNumber),
      rate: toStr(row.rate),
      notes: toStr(row.notes),
      addedAt: toStr(row.addedAt) || new Date().toISOString(),
      updatedAt: toStr(row.updatedAt),
      email: toStr(row.email),
    }));
  writeAll(entries);
}

export function saveStaff(record: StaffRecord): StaffRecord {
  const existing = readAll().find((s) => s.id === record.id);
  const all = readAll().filter((s) => s.id !== record.id);
  writeAll([record, ...all]);
  void syncMasterRecord({ type: "staff", action: "upsert", data: record as unknown as Record<string, unknown> });
  appendAuditEntry({
    action: existing ? "edit" : "create",
    recordType: "staff",
    recordId: record.id,
    summary: `Staff ${record.id} — ${record.name} (${record.role})`,
    before: (existing ?? {}) as unknown as Record<string, string | number>,
    after: record as unknown as Record<string, string | number>,
  });
  return record;
}

export function updateStaff(id: string, updates: Partial<StaffRecord>): boolean {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  const before = all[idx];
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  writeAll(all);
  void syncMasterRecord({ type: "staff", action: "upsert", data: all[idx] as unknown as Record<string, unknown> });
  appendAuditEntry({
    action: "edit",
    recordType: "staff",
    recordId: id,
    summary: `Staff ${id} — ${before.name} updated`,
    before: before as unknown as Record<string, string | number>,
    after: all[idx] as unknown as Record<string, string | number>,
  });
  return true;
}

export function deleteStaff(id: string): boolean {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  const removed = all[idx];
  all.splice(idx, 1);
  writeAll(all);
  void syncMasterRecord({ type: "staff", action: "delete", id });
  appendAuditEntry({
    action: "delete",
    recordType: "staff",
    recordId: id,
    summary: `Deleted staff ${id} — ${removed.name}`,
    before: removed as unknown as Record<string, string | number>,
  });
  return true;
}

/**
 * Combined payee list for Salary/Daily Expense entry — drivers (from
 * `driverStore.ts`) plus non-driver staff, distinguished by ID prefix
 * (`DRV-` vs `STF-`). This is the one place those forms should read from.
 */
export function getPayeeOptions(): StaffOption[] {
  return [
    ...getDriverOptions().map((d) => ({
      value: d.value,
      label: d.label,
      name: d.name,
      rate: d.totalSalary,
    })),
    ...getStaffOptions(),
  ];
}

export function findPayeeById(id: string): StaffOption | undefined {
  return getPayeeOptions().find((p) => p.value === id);
}
