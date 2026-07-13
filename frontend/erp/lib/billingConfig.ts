import { getAllCargoSources, type CargoSourceType } from "./sheetConfig";

/**
 * Billing master data — bill categories (regular freight vs. separately
 * billed materials like empty pallets and KOPA) and per-plant customer
 * defaults. Companies live in ./companies (shared with the cargo form).
 * All lists are meant to grow: add a category or plant default here and
 * the Billing module picks it up automatically.
 */

export { COMPANIES, findCompany, type CompanyProfile } from "./companies";

/**
 * A bill category decides which trip lines land on which bill. `materialCodes`
 * claims specific material codes; the `freight` catch-all takes everything
 * not claimed by any other category. Extend this list for new separately
 * billed materials.
 */
export interface BillCategory {
  id: string;
  label: string;
  materialCodes: string[];
  /** Page-2 heading, e.g. "Empty Pallet Details" — defaults to "Detail Bill" */
  detailTitle?: string;
}

export const BILL_CATEGORIES: BillCategory[] = [
  {
    id: "freight",
    label: "Freight (regular materials)",
    materialCodes: [],
  },
  {
    id: "empty-pallet",
    label: "Empty Pallet",
    materialCodes: ["9508507", "6002594"],
    detailTitle: "Empty Pallet Details",
  },
  {
    id: "kopa",
    label: "KOPA Castings",
    materialCodes: ["6002593", "6002818", "7000680"],
  },
];

export function findBillCategory(id: string): BillCategory | undefined {
  return BILL_CATEGORIES.find((c) => c.id === id);
}

/** Codes claimed by any non-freight category — excluded from freight bills. */
export function specialMaterialCodes(): Set<string> {
  return new Set(
    BILL_CATEGORIES.filter((c) => c.id !== "freight").flatMap((c) => c.materialCodes)
  );
}

/** Does this material code belong on a bill of the given category? */
export function materialBelongsToCategory(
  materialCode: string,
  categoryId: string
): boolean {
  const code = materialCode.trim();
  if (categoryId === "freight") return !specialMaterialCodes().has(code);
  return findBillCategory(categoryId)?.materialCodes.includes(code) ?? false;
}

export interface BillCustomerDefaults {
  name: string;
  address: string;
  pin: string;
  gstNo: string;
}

/** Blank fallback for custom plants that have no prefilled billing defaults yet. */
export const BLANK_CUSTOMER_DEFAULTS: BillCustomerDefaults = {
  name: "",
  address: "",
  pin: "",
  gstNo: "",
};

/** Default bill-to details per plant — editable on every bill before saving.
 * Custom plants (added via Plants & Vendors) have no entry here; callers
 * should fall back to `BLANK_CUSTOMER_DEFAULTS`. */
export const PLANT_CUSTOMER_DEFAULTS: Partial<Record<CargoSourceType, BillCustomerDefaults>> = {
  "cargo-h19": {
    name: "PARANJPE AUTOCAST PVT.LTD",
    address: "H-19 Old MIDC Satara",
    pin: "415004",
    gstNo: "27AABCP0318G1ZT",
  },
  "cargo-j14": {
    name: "PARANJPE AUTOCAST PVT.LTD",
    address: "J-14 Additional MIDC Satara",
    pin: "415004",
    gstNo: "27AABCP0318G1ZT",
  },
  "cargo-j15-j16": {
    name: "PARANJPE AUTOCAST PVT.LTD",
    address: "J-15/16 Additional MIDC Satara",
    pin: "415004",
    gstNo: "27AABCP0318G1ZT",
  },
  "cargo-matoshri": {
    name: "PARANJPE AUTOCAST PVT.LTD",
    address: "J-14 Additional MIDC Satara",
    pin: "415004",
    gstNo: "27AABCP0318G1ZT",
  },
  "cargo-minerva": {
    name: "PARANJPE AUTOCAST PVT.LTD",
    address: "J-16 Additional MIDC Satara",
    pin: "415004",
    gstNo: "27AABCP0318G1ZT",
  },
  "cargo-machine-shop": {
    name: "PARANJPE AUTOCAST PVT.LTD",
    address: "PACPRIL 1117 Machine Shop, Shirwal",
    pin: "412801",
    gstNo: "27AABCP0318G1ZT",
  },
};

export function getBillPlants() {
  return getAllCargoSources().map((s) => ({
    type: s.type,
    label: s.label,
  }));
}

/** Customer plant code printed in the detail table (SAP plant, e.g. 1113). */
export const DEFAULT_PLANT_CODE = "1113";

export const GST_PERCENT_DEFAULT = 18;
