import "server-only";

/**
 * Request validation at the server-action boundary. The GAS backend has its
 * own checks, but nothing from the browser should reach it unvetted.
 *
 * Sheet types the API accepts — mirrors SHEET_MAP in google-apps-script/
 * Code.gs minus the 6 legacy per-plant cargo tabs, which are a frozen
 * historical backup nothing reads or writes anymore.
 */
export const SHEET_TYPES = new Set([
  "cargo",
  "infra",
  "pallets",
  "diesel",
  "drivers",
  "salary",
  "driver-expense",
  "ledger",
  "trip-expense",
  "materials",
  "vehicle-master",
  "vehicle-maintenance",
  "locations",
  "staff",
  "bills",
  "audit",
]);

/** Mirrors MAX_BATCH_RECORDS in Code.gs. */
export const MAX_BATCH = 200;

const MAX_KEYS = 100;
// Generous because bills carry a full JSON snapshot in one cell (billJson).
const MAX_STRING_LENGTH = 100_000;

export function isValidType(type: unknown): type is string {
  return typeof type === "string" && SHEET_TYPES.has(type);
}

/**
 * A row must be a plain object of primitive cell values — anything nested
 * or exotic has no business becoming a spreadsheet cell.
 */
export function isFlatRecord(
  value: unknown
): value is Record<string, string | number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_KEYS) return false;
  for (const [, cell] of entries) {
    if (cell === null || cell === undefined) continue;
    const t = typeof cell;
    if (t !== "string" && t !== "number" && t !== "boolean") return false;
    if (t === "string" && (cell as string).length > MAX_STRING_LENGTH) {
      return false;
    }
    if (t === "number" && !Number.isFinite(cell as number)) return false;
  }
  return true;
}
