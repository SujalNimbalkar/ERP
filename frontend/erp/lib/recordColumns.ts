import {
  CARGO_FIELDS,
  DIESEL_FILL_FIELDS,
  DRIVER_EXPENSE_FIELDS,
  DRIVER_MASTER_FIELDS,
  getAllCargoSources,
  INFRA_FIELDS,
  LEDGER_FIELDS,
  SALARY_FIELDS,
  TRIP_EXPENSE_RECORD_FIELDS,
} from "./sheetConfig";
import type { FieldConfig, LocalRecord, SheetType } from "./types";

export interface RecordColumn {
  key: string;
  label: string;
}

export interface RecordViewConfig {
  id: string;
  label: string;
  types: SheetType[];
  columns: RecordColumn[];
}

function columnsFromFields(fields: FieldConfig[]): RecordColumn[] {
  return fields.map((f) => ({ key: f.name, label: f.label }));
}

const META_COLUMNS: RecordColumn[] = [
  { key: "_savedAt", label: "Saved At" },
  { key: "_sheet", label: "Sheet / Tab" },
];

const ID_COLUMN: RecordColumn = { key: "id", label: "ID" };

export const RECORD_VIEWS: RecordViewConfig[] = [
  {
    id: "cargo",
    label: "Cargo Transport",
    types: ["cargo"],
    columns: [
      ...META_COLUMNS,
      ID_COLUMN,
      ...columnsFromFields(CARGO_FIELDS),
    ],
  },
  {
    id: "infra",
    label: "Infra & Crusher",
    types: ["infra"],
    columns: [...META_COLUMNS, ID_COLUMN, ...columnsFromFields(INFRA_FIELDS)],
  },
  {
    id: "diesel",
    label: "Diesel Tank",
    types: ["diesel"],
    columns: [...META_COLUMNS, ID_COLUMN, ...columnsFromFields(DIESEL_FILL_FIELDS)],
  },
  {
    id: "drivers",
    label: "Driver Master",
    types: ["drivers"],
    columns: [...META_COLUMNS, ...columnsFromFields(DRIVER_MASTER_FIELDS)],
  },
  {
    id: "salary",
    label: "Driver Salaries",
    types: ["salary"],
    columns: [...META_COLUMNS, ID_COLUMN, ...columnsFromFields(SALARY_FIELDS)],
  },
  {
    id: "driver-expense",
    label: "Driver Expenses",
    types: ["driver-expense"],
    columns: [...META_COLUMNS, ID_COLUMN, ...columnsFromFields(DRIVER_EXPENSE_FIELDS)],
  },
  {
    id: "ledger",
    label: "Customer Ledger",
    types: ["ledger"],
    columns: [...META_COLUMNS, ID_COLUMN, ...columnsFromFields(LEDGER_FIELDS)],
  },
  {
    id: "trip-expense",
    label: "Trip Expenses",
    types: ["trip-expense"],
    columns: [...META_COLUMNS, ...columnsFromFields(TRIP_EXPENSE_RECORD_FIELDS)],
  },
];

export function sheetTypeLabel(type: SheetType): string {
  return getAllCargoSources().find((s) => s.type === type)?.label ?? type;
}

/** Source label for a record — for cargo rows this resolves the plant via
 * `data.plantType` (all cargo rows share the one `"cargo"` SheetType). */
export function recordSourceLabel(record: LocalRecord): string {
  if (record.type === "cargo") {
    return sheetTypeLabel(String(record.data.plantType ?? record.type));
  }
  return sheetTypeLabel(record.type);
}

export function filterRecordsForView(
  records: LocalRecord[],
  view: RecordViewConfig
): LocalRecord[] {
  return records.filter((r) => view.types.includes(r.type));
}

export function getCellValue(record: LocalRecord, key: string): string {
  if (key === "_savedAt") {
    try {
      return new Date(record.savedAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return record.savedAt;
    }
  }
  if (key === "_sheet") return recordSourceLabel(record);
  const value = record.data[key];
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

export function searchRecords(records: LocalRecord[], query: string): LocalRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((record) => {
    const haystack = [
      record.type,
      recordSourceLabel(record),
      ...Object.values(record.data).map(String),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function recordsToCsv(records: LocalRecord[], columns: RecordColumn[]): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(",");
  const rows = records.map((record) =>
    columns.map((col) => escapeCsv(getCellValue(record, col.key))).join(",")
  );
  return [header, ...rows].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
