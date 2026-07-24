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
    id: "dashboard",
    label: "Dashboard",
    description: "Vehicle & driver analytics, transportation profit / loss",
  },
  {
    id: "cargo",
    label: "Cargo Transport",
    description: "Billing, freight & route (H19, J14, J15 - J16, Matoshri, Minerva, Machine Shop)",
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
    id: "payroll",
    label: "Payroll",
    description: "Salary and daily wage/expense entries for drivers and staff",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Monthly tax invoices per company, plant & category",
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

/** Shared by any trip-style module (Cargo, Infra & Crusher) that wants a
 * reference to an active tank fill. NOTE: the actual toll/diesel-used
 * *amounts* are NOT here — Cargo emits one row per material line, so a
 * trip-level amount stored inline would repeat on every row and inflate any
 * SUM() over the column. Those live in their own Trip Expense record instead
 * (see `TRIP_EXPENSE_AMOUNT_FIELDS`/`TRIP_EXPENSE_RECORD_FIELDS` below),
 * referenced via `tripExpenseRef` (safe to repeat per row, same idea as
 * `dieselFillRef` here — a lookup key, not a summed amount). */
export const TRIP_EXPENSE_FIELDS: FieldConfig[] = [
  {
    name: "dieselFillRef",
    label: "Diesel Fill Ref",
    type: "text",
    placeholder: "e.g. MH11CH2030-2026-07-03",
  },
];

/** The two amounts entered once per trip, saved as a single Trip Expense
 * record rather than inline on every cargo/infra row. */
export const TRIP_EXPENSE_AMOUNT_FIELDS: FieldConfig[] = [
  {
    name: "dieselUsedThisTrip",
    label: "Diesel Used This Trip (Rs)",
    type: "number",
    placeholder: "Leave blank if unknown — reconcile in sheet",
  },
  {
    name: "tollOverloadAmount",
    label: "Toll + Overload (Rs)",
    type: "number",
  },
];

/**
 * Client-generated id for a Trip Expense record — generated *before* saving
 * so the same ref can be stamped onto every cargo/infra row of the same
 * submission as `tripExpenseRef` (a lookup key, safe to repeat per row —
 * same idea as `dieselFillRef`). Not a sequential auto-id like other modules
 * (see the note on `ID_PREFIXES` in localStore.ts for why).
 */
export function buildTripExpenseRef(vehicleNo: string, date: string): string {
  const vehicle = vehicleNo.trim().toUpperCase().replace(/\s+/g, "");
  const day = date.trim();
  if (!vehicle || !day) return "";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TRX-${vehicle}-${day}-${suffix}`;
}

/** Schema for the dedicated Trip Expense sheet — one row per trip, created
 * from Cargo Transport or Infra & Crusher whenever either amount above is
 * filled in. */
export const TRIP_EXPENSE_RECORD_FIELDS: FieldConfig[] = [
  { name: "id", label: "ID (auto)", type: "text", readOnly: true },
  DATE_FIELD,
  { ...VEHICLE_NO_FIELD, label: "Vehicle No", placeholder: undefined, required: false },
  { name: "driverId", label: "Driver ID", type: "text" },
  { name: "driverName", label: "Driver Name", type: "text" },
  ...TRIP_EXPENSE_AMOUNT_FIELDS,
  { name: "source", label: "Source Module", type: "text", readOnly: true, placeholder: "cargo or infra" },
  {
    name: "documentNos",
    label: "Invoice / Document Nos",
    type: "text",
    placeholder: "Comma-separated — Cargo only",
  },
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
    fields: TRIP_EXPENSE_FIELDS,
  },
  {
    // Not rendered via this section's generic grouping — CargoTransportForm
    // renders these two inline as ColoredCheckboxField, same as Infra & Crusher.
    // Kept here purely so they flow into CARGO_FIELDS (schema + sheet columns).
    id: "diesel-maintenance-flags",
    title: "Diesel & Maintenance Flags",
    fields: [
      { name: "dieselFilled", label: "Diesel filled on this trip?", type: "checkbox" },
      { name: "maintenanceThisTrip", label: "Maintenance done on this trip?", type: "checkbox" },
      {
        name: "tripExpenseRef",
        label: "Trip Expense Ref (auto)",
        type: "text",
        readOnly: true,
      },
      // Drive link to a receipt image auto-captured from the Confirm & Save
      // dialog — blank when capture/upload failed or hasn't happened yet
      // (see performSave() in CargoTransportForm.tsx).
      {
        name: "receiptImageUrl",
        label: "Receipt Image (auto)",
        type: "text",
        readOnly: true,
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
    name: "odometerKm",
    label: "Odometer Reading (km, optional)",
    type: "number",
    placeholder: "Read occasionally (e.g. once a month) to enable fuel-efficiency tracking",
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

/** Diesel Tank Fill fields relevant once vehicle/date/driver are already known
 * from a trip's own fields (Cargo, Infra & Crusher) — everything except those
 * shared fields, which the linking trip form supplies itself. */
export const DIESEL_SUBFORM_FIELDS: FieldConfig[] = DIESEL_FILL_FIELDS.filter(
  (f) => !["fillRef", "date", "vehicleNo", "driverName", "driverId"].includes(f.name)
);

/** Fixed choices for Infra & Crusher's "Type of Material" — rendered as a
 * select with a custom "Other" free-text fallback (see InfraCrusherForm.tsx),
 * not a plain FieldConfig select, so an arbitrary value typed under "Other"
 * still round-trips correctly on re-edit. */
export const INFRA_MATERIAL_TYPE_OPTIONS = [
  "Khadi 20 mm",
  "Khadi 10 mm",
  "Khadi 6mm",
  "Crush Sand",
  "Plaster Sand",
  "Dabar",
];

export const INFRA_FIELDS: FieldConfig[] = [
  DATE_FIELD,
  { ...VEHICLE_NO_FIELD, label: "Vehicle No", placeholder: undefined },
  { name: "crusherChallanNo", label: "Crusher Challan No", type: "text" },
  { name: "materialType", label: "Type of Material", type: "text", placeholder: "Dabar, Khadi, Sand..." },
  { name: "crusherRate", label: "Crusher Rate (Rs/Brass)", type: "number", step: "0.01" },
  { name: "crusherBrass", label: "Crusher Brass (Total Brass)", type: "number", step: "0.01" },
  { name: "crusherLocation", label: "Crusher Location", type: "text", placeholder: "e.g. crusher site" },
  {
    name: "crusherAmount",
    label: "Crusher Amount (auto)",
    type: "number",
    step: "0.01",
    readOnly: true,
    placeholder: "Auto: crusher rate x crusher brass",
  },
  { name: "challanNo", label: "Challan No", type: "text" },
  {
    name: "customerName",
    label: "Customer Name (auto)",
    type: "text",
    required: true,
    readOnly: true,
    placeholder: "Pick a Client / Project below",
  },
  {
    name: "clientLocation",
    label: "Client Location (auto)",
    type: "text",
    readOnly: true,
    placeholder: "Auto-filled from the selected Client / Project",
  },
  { name: "qtyBrass", label: "Qty (In Brass)", type: "number", step: "0.01" },
  { name: "rate", label: "Selling Rate (Rs/Brass)", type: "number", step: "0.01" },
  {
    name: "totalAmount",
    label: "Total Amount (auto)",
    type: "number",
    step: "0.01",
    readOnly: true,
    placeholder: "Auto: selling rate x qty brass",
  },
  {
    name: "difference",
    label: "Difference (auto)",
    type: "number",
    step: "0.01",
    readOnly: true,
    placeholder: "Auto: total amount - crusher amount",
  },
  // Appended below so existing sheet rows keep their column alignment.
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
  ...TRIP_EXPENSE_FIELDS,
  {
    name: "dieselFilled",
    label: "Diesel filled on this trip?",
    type: "checkbox",
  },
  {
    name: "maintenanceThisTrip",
    label: "Maintenance done on this trip?",
    type: "checkbox",
  },
  {
    name: "tripExpenseRef",
    label: "Trip Expense Ref (auto)",
    type: "text",
    readOnly: true,
  },
  // Reference into the Client Companies master (lib/clientStore.ts) — the
  // reliable join key Infra billing groups trips by. Appended last so
  // existing sheet rows keep their column alignment, same as the fields above.
  {
    name: "clientRef",
    label: "Client/Project Ref (auto)",
    type: "text",
    readOnly: true,
  },
];

/**
 * Crusher Amount = crusher rate x crusher brass; Total Amount = selling rate
 * x qty brass; Difference = Total Amount - Crusher Amount — recomputed from
 * whatever numbers are currently present, not tied to a single changed
 * field. Shared by the Infra & Crusher form and the Saved Records edit view
 * (so fixing a typo there re-derives the same amounts instead of leaving
 * them stale).
 */
export function recalcInfraAmounts(values: Record<string, string>): Record<string, string> {
  const crusherRate = Number(values.crusherRate);
  const crusherBrass = Number(values.crusherBrass);
  const crusherAmount =
    crusherRate > 0 && crusherBrass > 0 ? Math.round(crusherRate * crusherBrass * 100) / 100 : null;

  const rate = Number(values.rate);
  const qtyBrass = Number(values.qtyBrass);
  const totalAmount = rate > 0 && qtyBrass > 0 ? Math.round(rate * qtyBrass * 100) / 100 : null;

  const difference =
    crusherAmount !== null && totalAmount !== null
      ? Math.round((totalAmount - crusherAmount) * 100) / 100
      : null;

  return {
    ...values,
    crusherAmount: crusherAmount !== null ? String(crusherAmount) : "",
    totalAmount: totalAmount !== null ? String(totalAmount) : "",
    difference: difference !== null ? String(difference) : "",
  };
}

/**
 * Row-scoped Cargo recalculation for the Saved Records edit view — a single
 * already-saved row has no access to the rest of its trip (other invoices'
 * weight feeding the weight-tier rate), so this only re-derives what's
 * knowable from the row itself: Total Wt from Qty x Per Part Wt (for EA rows)
 * or Qty directly (for KG rows), and Transport Amount from Transport Rate x
 * Total Wt. Brass-uom rows and direct edits to Total Wt itself are left
 * alone — the user's own number wins.
 */
export function recalcCargoRowAmounts(
  values: Record<string, string>,
  changedField: string
): Record<string, string> {
  const next = { ...values };

  if (changedField === "quantity" || changedField === "perPartWt" || changedField === "uom") {
    const qty = Number(next.quantity);
    const perPart = Number(next.perPartWt);
    if (next.uom === "KG" && qty) {
      next.totalWt = String(qty);
    } else if (next.uom === "EA" && qty && perPart) {
      next.totalWt = String(Math.round(qty * perPart * 1000) / 1000);
    }
  }

  if (["quantity", "perPartWt", "uom", "transportRate", "totalWt"].includes(changedField)) {
    const totalWt = Number(next.totalWt);
    const transportRate = Number(next.transportRate);
    if (transportRate > 0 && totalWt > 0) {
      next.transportAmount = String(Math.round(transportRate * totalWt * 100) / 100);
    }
  }

  return next;
}

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
