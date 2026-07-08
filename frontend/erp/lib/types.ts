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
  | "ledger";

export type FieldType = "text" | "number" | "date" | "select" | "textarea";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  step?: string;
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

export interface LocalRecord {
  id: string;
  type: SheetType;
  data: Record<string, string | number>;
  savedAt: string;
}

export type FormValues = Record<string, string>;
