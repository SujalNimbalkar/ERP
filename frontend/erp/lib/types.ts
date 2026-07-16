/**
 * `(string & {})` keeps these literals suggested by autocomplete while still
 * accepting arbitrary custom Cargo plant types (e.g. "cargo-new-plant") added
 * at runtime via the Plants & Vendors module.
 */
export type SheetType =
  | "cargo-h19"
  | "cargo-j14"
  | "cargo-j15-j16"
  | "cargo-matoshri"
  | "cargo-minerva"
  | "cargo-machine-shop"
  | "infra"
  | "pallets"
  | "diesel"
  | "drivers"
  | "salary"
  | "driver-expense"
  | "ledger"
  | "trip-expense"
  | "clients"
  | (string & {});

export type FieldType = "text" | "number" | "date" | "select" | "textarea" | "checkbox";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<string | { value: string; label: string }>;
  step?: string;
  min?: string;
  max?: string;
  colSpan?: 1 | 2;
  readOnly?: boolean;
}

export interface FieldSection {
  id: string;
  title: string;
  description?: string;
  fields: FieldConfig[];
}

export interface ModuleConfig {
  id: string;
  label: string;
  description: string;
}

export interface SubmitPayload {
  type: SheetType;
  data?: Record<string, string | number>;
  records?: Record<string, string | number>[];
}

export interface ApiResponse {
  success: boolean;
  message: string;
  storage?: "local" | "remote";
}

export type MasterType =
  | "vehicle-master"
  | "vehicle-maintenance"
  | "materials"
  | "locations"
  | "staff"
  | "bills"
  | "clients"
  | "audit";

export interface MasterSyncPayload {
  type: MasterType | SheetType;
  action: "upsert" | "delete";
  data?: Record<string, unknown>;
  id?: string;
}

export interface LocalRecord {
  id: string;
  type: SheetType;
  data: Record<string, string | number>;
  savedAt: string;
  /**
   * Whether this record's Sheet sync is confirmed. `undefined` = cloud sync
   * wasn't configured when it was saved (nothing to retry); `false` = a Sheet
   * POST was attempted and failed (retryable); `true` = confirmed synced.
   */
  synced?: boolean;
}

export type FormValues = Record<string, string>;
