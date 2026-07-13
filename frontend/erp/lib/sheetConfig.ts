import { COMPANY_SELECT_OPTIONS } from "./companies";
import { getCargoSourceLocations, getVendorOnlyNames } from "./locationStore";
import type { FieldConfig, FieldSection, ModuleConfig, SheetType } from "./types";

/** Shared field configs — reused across sections/arrays below instead of redeclaring per module. */
const DATE_FIELD: FieldConfig = { name: "date", label: "Date", type: "date", required: true };
/** Which company bills this trip — decides which monthly bill it lands on. */
const BILLING_COMPANY_FIELD: FieldConfig = {
  name: "billingCompany",
  label: "Billing Company",
  type: "select",
  required: true,
  options: COMPANY_SELECT_OPTIONS,
};
const VEHICLE_NO_FIELD: FieldConfig = {
  name: "vehicleNo",
  label: "Vehicle No.",
  type: "text",
  required: true,
  placeholder: "e.g. MH11CH2030",
};

export const MODULES: ModuleConfig[] = [
  {
    id: "cargo",
    label: "Cargo Transport",
    description: "Billing, freight & route (H19, J14, J15 - J16, Matoshri, Minerva, Machine Shop)",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Monthly tax invoices per company, plant & category",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Vehicle & driver analytics, transportation profit / loss",
  },
  {
    id: "infra",
    label: "Infra & Crusher",
    description: "Crusher and infrastructure transport",
  },
  {
    id: "diesel",
    label: "Diesel Tank",
    description: "Full tank fills shared across multiple trips",
  },
  {
    id: "drivers",
    label: "Drivers",
    description: "Driver master for vehicle-assigned drivers",
  },
  {
    id: "staff",
    label: "Staff Master",
    description: "Accountants, hamals and other non-driver staff",
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Salary and daily wage/expense entries for drivers and staff",
  },
  {
    id: "ledger",
    label: "Customer Ledger",
    description: "Customer debit and credit entries",
  },
  {
    id: "materials",
    label: "Material Master",
    description: "Browse built-in materials and add custom entries",
  },
  {
    id: "parties",
    label: "Plants & Vendors",
    description: "One list of places — flag any of them as a Cargo Plant origin",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    description: "Fleet master and maintenance log",
  },
  {
    id: "records",
    label: "Saved Records",
    description: "View saved entries in table form",
  },
];

export const BUILT_IN_CARGO_SOURCES = [
  { type: "cargo-h19", label: "H19 - Paranjape Satara" },
  { type: "cargo-j14", label: "J14 - Paranjape Satara" },
  { type: "cargo-j15-j16", label: "J15 - J16 - Paranjape Satara" },
  { type: "cargo-matoshri", label: "Matoshri Enterprise - Shirwal" },
  { type: "cargo-minerva", label: "Minerva Enterprises - Kolhapur" },
  { type: "cargo-machine-shop", label: "Machine Shop - Paranjape Shirwal" },
] as const;

export type CargoSourceType = string;

export interface CargoSource {
  type: CargoSourceType;
  label: string;
}

/** Built-in plants + any custom locations flagged as a Cargo Plant. */
export function getAllCargoSources(): CargoSource[] {
  return [
    ...BUILT_IN_CARGO_SOURCES,
    ...getCargoSourceLocations().map((l) => ({ type: l.cargoType as string, label: l.name })),
  ];
}

/**
 * Destinations for a given origin: every other known plant (built-in + custom)
 * plus every destination-only location — computed, not hand-maintained.
 * Plant-flagged locations already come in via `otherPlants`, so nothing
 * appears twice even though both lists live in the same store now.
 */
export function getCargoDestinationsFor(sourceType: CargoSourceType): string[] {
  const otherPlants = getAllCargoSources()
    .filter((s) => s.type !== sourceType)
    .map((s) => s.label);
  return [...otherPlants, ...getVendorOnlyNames()];
}

export function getCargoRouteDefaults(sourceType: CargoSourceType) {
  const source = getAllCargoSources().find((s) => s.type === sourceType);
  return {
    fromLocation: source?.label ?? "",
    toOptions: getCargoDestinationsFor(sourceType),
  };
}

export const PLANT_LOCATIONS = [
  "H19",
  "J14",
  "J15",
  "J16",
  "Matoshri Enterprise",
  "Minerva Enterprises",
];

/** Form sections — columns aligned to Google Sheet headers */
export const CARGO_SECTIONS: FieldSection[] = [
  {
    id: "document",
    title: "Document",
    fields: [
      {
        name: "documentNo",
        label: "Invoice / DC No",
        type: "text",
        required: true,
        placeholder: "e.g. 5900089218, ME1/JUL26/04",
      },
      DATE_FIELD,
    ],
  },
  {
    id: "route",
    title: "Route",
    description: "From plant to consignee — e.g. Minerva → J-14, J-15/16 → Minerva",
    fields: [
      BILLING_COMPANY_FIELD,
      {
        name: "fromLocation",
        label: "From",
        type: "text",
        required: true,
        readOnly: true,
      },
      {
        name: "toParty",
        label: "To",
        type: "select",
        required: true,
        options: [],
      },
    ],
  },
  {
    id: "transport",
    title: "Transport",
    fields: [
      VEHICLE_NO_FIELD,
      {
        name: "lrNo",
        label: "L.R. No.",
        type: "text",
        placeholder: "e.g. 1517",
      },
      {
        name: "driverId",
        label: "Driver",
        type: "select",
        options: [],
      },
      {
        name: "driverName",
        label: "Driver Name (auto)",
        type: "text",
        readOnly: true,
      },
    ],
  },
  {
    id: "material",
    title: "Material",
    description:
      "Enter material code — name and per-piece weight auto-fill. Trip rate is Rs 0.78/kg below 5.5 tons, Rs 0.74/kg from 5.5 to 9 tons, and Rs 0.72/kg above 9 tons.",
    fields: [
      {
        name: "materialCode",
        label: "Item / Material Code",
        type: "text",
        required: true,
      },
      {
        name: "materialDescription",
        label: "Material Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "hsnCode",
        label: "HSN / SAC Code",
        type: "text",
        placeholder: "e.g. 73259910",
      },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        required: true,
        step: "0.01",
      },
      {
        name: "uom",
        label: "Unit",
        type: "select",
        required: true,
        options: ["EA", "KG", "Brass"],
      },
      {
        name: "perPartWt",
        label: "Per Part Wt (Kg)",
        type: "number",
        step: "0.01",
        readOnly: true,
        placeholder: "Auto-filled from material master",
      },
      {
        name: "totalWt",
        label: "Total Wt (Kg)",
        type: "number",
        step: "0.01",
        readOnly: true,
      },
      {
        name: "transportRate",
        label: "Transport Rate (Rs)",
        type: "number",
        step: "0.01",
        readOnly: true,
      },
      {
        name: "transportAmount",
        label: "Transport Amount (Rs)",
        type: "number",
        step: "0.01",
        readOnly: true,
      },
      {
        name: "rateTier",
        label: "Rate Applied",
        type: "text",
        readOnly: true,
        placeholder: "Standard or Partial load",
      },
    ],
  },
  {
    id: "expenses",
    title: "Trip Expenses",
    description: "Link to an active tank fill — enter this trip's diesel share if known",
    fields: [
      {
        name: "dieselFillRef",
        label: "Diesel Fill Ref",
        type: "text",
        placeholder: "e.g. MH11CH2030-2026-07-03",
      },
      {
        name: "dieselUsedThisTrip",
        label: "Diesel Used This Trip (Rs)",
        type: "number",
        // step: "0.01",
        placeholder: "Leave blank if unknown — reconcile in sheet",
      },
      {
        name: "tollOverloadAmount",
        label: "Toll + Overload (Rs)",
        type: "number",
        // step: "0.01",
      },
    ],
  },
  {
    id: "receipt",
    title: "Receipt (Optional)",
    description: "Receiving stamp on inbound bills",
    fields: [
      {
        name: "receivedQty",
        label: "Received Qty",
        type: "number",
        // step: "0.01",
      },
      { name: "receivedDate", label: "Received Date", type: "date" },
    ],
  },
];

/** Flat list of all cargo fields — used for empty state & sheet columns */
export const CARGO_FIELDS = CARGO_SECTIONS.flatMap((s) => s.fields);

export const DRIVER_MASTER_FIELDS: FieldConfig[] = [
  {
    name: "driverId",
    label: "Driver ID (auto)",
    type: "text",
    readOnly: true,
  },
  {
    name: "firstName",
    label: "First Name",
    type: "text",
    required: true,
  },
  {
    name: "middleName",
    label: "Middle Name",
    type: "text",
  },
  {
    name: "surname",
    label: "Surname",
    type: "text",
    required: true,
  },
  {
    name: "mobileNumber",
    label: "Mobile Number",
    type: "text",
    required: true,
    placeholder: "10-digit mobile number",
  },
  {
    name: "aadharNumber",
    label: "Aadhar Number",
    type: "text",
    // required: true,
    placeholder: "12-digit Aadhar number",
  },
  {
    name: "accountNumber",
    label: "Account Number",
    type: "text",
    // required: true,
  },
  {
    name: "totalSalary",
    label: "Total Salary (Rs)",
    type: "number",
    required: true,
    // step: "0.01",
  },
];


/** Default pump price — editable per fill in the form. */
export const DIESEL_RATE_PER_LITER = 99.24;

export const DIESEL_FILL_FIELDS: FieldConfig[] = [
  {
    name: "fillRef",
    label: "Fill Ref (auto)",
    type: "text",
    readOnly: true,
    placeholder: "Generated from vehicle + date",
    colSpan: 2,
  },
  { ...DATE_FIELD, label: "Fill Date" },
  VEHICLE_NO_FIELD,
  {
    name: "fillAmount",
    label: "Tank Fill Amount (Rs)",
    type: "number",
    required: true,
    // step: "0.01",
    placeholder: "Total paid for full tank",
  },
  {
    name: "ratePerLiter",
    label: "Diesel Rate (Rs/liter)",
    type: "number",
    step: "0.01",
    placeholder: `e.g. ${DIESEL_RATE_PER_LITER}`,
  },
  {
    name: "liters",
    label: "Liters Filled (auto)",
    type: "number",
    step: "0.01",
    placeholder: "Auto: amount ÷ rate",
  },
  {
    name: "driverName",
    label: "Driver",
    type: "select",
    options: [],
  },
  {
    name: "driverId",
    label: "Driver ID (auto)",
    type: "text",
    readOnly: true,
    placeholder: "Auto-filled from driver selection",
  },
  {
    name: "expectedTrips",
    label: "Expected Trips",
    type: "number",
    placeholder: "How many trips this fill should cover",
  },
  {
    name: "note",
    label: "Note",
    type: "textarea",
    placeholder: "e.g. Full tank for Satara–Kolhapur runs",
    colSpan: 2,
  },
];

export const INFRA_FIELDS: FieldConfig[] = [
  DATE_FIELD,
  { ...VEHICLE_NO_FIELD, label: "Vehicle No", placeholder: undefined },
  { name: "crusherChallanNo", label: "Crusher Challan No", type: "text" },
  { name: "materialType", label: "Type of Material", type: "text", placeholder: "Dabar, Khadi, Sand..." },
  { name: "crusherRate", label: "Crusher Rate", type: "number", step: "0.01" },
  { name: "crusherBrass", label: "Crusher Brass", type: "number", step: "0.01" },
  { name: "crusherAmount", label: "Crusher Amount", type: "number", step: "0.01" },
  { name: "diesel", label: "Diesel", type: "number", step: "0.01" },
  { name: "challanNo", label: "Challan No", type: "text" },
  { name: "customerName", label: "Customer Name", type: "text", required: true },
  { name: "qtyBrass", label: "Qty (In Brass)", type: "number", step: "0.01" },
  { name: "rate", label: "Rate", type: "number", step: "0.01" },
  { name: "totalAmount", label: "Total Amount", type: "number", step: "0.01" },
  { name: "difference", label: "Difference", type: "number", step: "0.01" },
];

export const PALLET_FIELDS: FieldConfig[] = [
  BILLING_COMPANY_FIELD,
  DATE_FIELD,
  {
    name: "dcNo",
    label: "DC No (Delivery Challan)",
    type: "text",
    required: true,
    placeholder: "e.g. 4913243533",
  },
  {
    name: "plant",
    label: "From Plant",
    type: "select",
    required: true,
    options: PLANT_LOCATIONS,
  },
  {
    name: "toParty",
    label: "To (Foundry / Plant)",
    type: "text",
    required: true,
    placeholder: "e.g. Cast Iron Foundry J-14",
  },
  { name: "materialCode", label: "Material Code", type: "text", required: true },
  {
    name: "materialDescription",
    label: "Material Description",
    type: "text",
    required: true,
    placeholder: "e.g. Empty pallet",
  },
  {
    name: "uom",
    label: "Unit",
    type: "select",
    required: true,
    options: ["EA", "KG"],
  },
  { name: "qty", label: "Qty", type: "number", required: true },
  { ...VEHICLE_NO_FIELD, required: false, placeholder: undefined },
  { name: "lrNo", label: "L.R. No.", type: "text" },
  { name: "freightAmount", label: "Freight (Rs)", type: "number", step: "0.01" },
  {
    name: "remarks",
    label: "Remarks",
    type: "text",
    placeholder: "e.g. empty pallet return",
    colSpan: 2,
  },
];


/** Four fixed salary dates each month */
export const SALARY_PAY_DATES = ["1st", "8th", "15th", "22nd"] as const;

export const SALARY_PAYMENT_TYPES = [
  "Regular Salary",
  "Advance Payment",
  "Delayed Payment",
] as const;

export const SALARY_FIELDS: FieldConfig[] = [
  {
    name: "driverId",
    label: "Staff / Driver",
    type: "select",
    required: true,
    options: [],
  },
  {
    name: "driverName",
    label: "Name (auto)",
    type: "text",
    readOnly: true,
  },
  {
    name: "paymentType",
    label: "Payment Type",
    type: "select",
    required: true,
    options: [...SALARY_PAYMENT_TYPES],
  },
  {
    name: "scheduledSalaryDate",
    label: "Scheduled Salary Date",
    type: "select",
    required: true,
    options: [...SALARY_PAY_DATES],
    placeholder: "Which of the 4 salary dates this relates to",
  },
  {
    name: "paymentDate",
    label: "Payment Date",
    type: "date",
    required: true,
    placeholder: "Actual date money was given",
  },
  {
    name: "amount",
    label: "Amount (Rs)",
    type: "number",
    required: true,
    step: "0.01",
  },
  {
    name: "reason",
    label: "Reason",
    type: "textarea",
    placeholder: "Required for advance or delayed payment",
    colSpan: 2,
  },
];

export const DRIVER_EXPENSE_TYPES = [
  "Food",
  "Travel",
  "Lodging / Night Halt",
  "Toll / Parking",
  "Mobile Recharge",
  "Medical",
  "Repair on Road",
  "Other",
] as const;

export const DRIVER_EXPENSE_PAYMENT_MODES = ["Cash", "UPI", "Company Account"] as const;

export const DRIVER_EXPENSE_FIELDS: FieldConfig[] = [
  {
    name: "driverId",
    label: "Staff / Driver",
    type: "select",
    required: true,
    options: [],
  },
  {
    name: "driverName",
    label: "Name (auto)",
    type: "text",
    readOnly: true,
  },
  DATE_FIELD,
  {
    name: "expenseType",
    label: "Expense Type",
    type: "select",
    required: true,
    options: [...DRIVER_EXPENSE_TYPES],
  },
  {
    name: "amount",
    label: "Amount (Rs)",
    type: "number",
    required: true,
    step: "0.01",
  },
  {
    name: "paymentMode",
    label: "Paid Via",
    type: "select",
    options: [...DRIVER_EXPENSE_PAYMENT_MODES],
  },
  {
    name: "note",
    label: "Note",
    type: "textarea",
    placeholder: "e.g. lunch on Kolhapur trip, bus fare back to Satara",
    colSpan: 2,
  },
];

export const LEDGER_FIELDS: FieldConfig[] = [
  DATE_FIELD,
  { name: "receiptNo", label: "Receipt No", type: "text" },
  { name: "particular", label: "Particular", type: "text", required: true },
  { ...VEHICLE_NO_FIELD, required: false, placeholder: undefined },
  { name: "rate", label: "Rate", type: "number", step: "0.01" },
  { name: "brass", label: "Brass", type: "number", step: "0.01" },
  { name: "debit", label: "Debit (Dr)", type: "number", step: "0.01" },
  { name: "credit", label: "Credit (Cr)", type: "number", step: "0.01" },
];

/** Which key in a record's data holds its Sheet-row identity. */
export function getRecordIdKey(type: SheetType): string {
  return type === "drivers" ? "driverId" : "id";
}

/** Turn a text field into a select once live options exist (e.g. vehicleNo, driverName). */
export function injectOptions(
  fields: FieldConfig[],
  fieldName: string,
  options: string[]
): FieldConfig[] {
  if (options.length === 0) return fields;
  return fields.map((f) =>
    f.name === fieldName ? { ...f, type: "select" as const, options } : f
  );
}

export function emptyValues(fields: FieldConfig[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.name, ""]));
}

export function parseFormData(
  values: Record<string, string>
): Record<string, string | number> {
  const parsed: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    const trimmed = value.trim();
    if (trimmed === "") continue;
    const num = Number(trimmed);
    parsed[key] = /^-?\d+(\.\d+)?$/.test(trimmed) ? num : trimmed;
  }
  return parsed;
}
