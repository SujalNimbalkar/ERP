import { syncMasterRecord } from "./api";
import { appendAuditEntry } from "./auditLog";
import { totalWeight, type BillLineItem, type RateGroup, type BillTotals } from "./billing";
import { totalQtyBrass, type InfraBillLineItem } from "./infraBilling";
import type { BillCustomerDefaults } from "./billingConfig";
import { companyName } from "./companies";

/**
 * Saved bills — kept in their own localStorage key (like the vehicle and
 * driver masters). A saved bill snapshots its line items so later edits to
 * trip records never change an already-issued invoice.
 */

export interface SavedBill {
  id: string;
  companyId: string;
  invoiceNo: string;
  invoiceDate: string;
  /** Billing month, YYYY-MM */
  month: string;
  plantType: string;
  plantLabel: string;
  categoryId: string;
  hsnNo: string;
  description: string;
  customer: BillCustomerDefaults;
  gstPercent: number;
  plantCode: string;
  lines: BillLineItem[];
  rateGroups: RateGroup[];
  totals: BillTotals;
  createdAt: string;
}

const BILLS_KEY = "sahyadri_erp_bills";
const BILL_UPDATE_EVENT = "sahyadri-bill-update";

function readBills(): SavedBill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BILLS_KEY);
    return raw ? (JSON.parse(raw) as SavedBill[]) : [];
  } catch {
    return [];
  }
}

function writeBills(bills: SavedBill[]) {
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BILL_UPDATE_EVENT));
  }
}

export function getAllBills(): SavedBill[] {
  return readBills();
}

export function getBillById(id: string): SavedBill | undefined {
  return readBills().find((b) => b.id === id);
}

/**
 * Flat one-row summary for the Sheet's Bills tab — the detail lines already
 * live on the cargo tabs, so the tab works as an invoice register.
 */
function billSheetRow(bill: SavedBill): Record<string, unknown> {
  return {
    id: bill.id,
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    month: bill.month,
    company: companyName(bill.companyId),
    plant: bill.plantLabel,
    category: bill.categoryId,
    hsnNo: bill.hsnNo,
    customerName: bill.customer.name,
    customerAddress: bill.customer.address,
    customerPin: bill.customer.pin,
    customerGst: bill.customer.gstNo,
    gstPercent: bill.gstPercent,
    rateSummary: bill.rateGroups
      .map((g) => `${g.qty} kg @ ${g.rate} = ${g.amount}`)
      .join("; "),
    totalWeightKg: totalWeight(bill.lines),
    subTotal: bill.totals.subTotal,
    cgst: bill.totals.cgst,
    sgst: bill.totals.sgst,
    grandTotal: bill.totals.grandTotal,
    description: bill.description,
    lineCount: bill.lines.length,
    createdAt: bill.createdAt,
    billJson: JSON.stringify(bill),
  };
}

/**
 * Replaces the local bill cache with rows fetched from Google Sheets.
 * Each row's billJson column holds the full SavedBill snapshot. Cargo and
 * Infra bills share this one "Bills" tab (the flat row columns are generic
 * enough for both) — a row belongs here unless its snapshot is tagged
 * `moduleType: "infra"` (see replaceWithSheetInfraBills below), so all
 * pre-existing cargo bills (which have no moduleType at all) still load.
 */
export function replaceWithSheetBills(rows: Record<string, unknown>[]): void {
  const bills: SavedBill[] = [];
  for (const row of rows) {
    const raw = row.billJson;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw) as SavedBill & { moduleType?: string };
      if (parsed.moduleType === "infra") continue;
      if (parsed && parsed.id && Array.isArray(parsed.lines)) bills.push(parsed);
    } catch {
      // malformed cell — skip the row rather than break hydration
    }
  }
  writeBills(bills);
}

/** Compact bill snapshot for audit entries — omits the bulky billJson/lines. */
function billAuditSnapshot(bill: SavedBill): Record<string, string | number> {
  return {
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    company: companyName(bill.companyId),
    plant: bill.plantLabel,
    category: bill.categoryId,
    month: bill.month,
    lineCount: bill.lines.length,
    grandTotal: bill.totals.grandTotal,
  };
}

export function saveBill(bill: SavedBill): SavedBill {
  const existed = readBills().some((b) => b.id === bill.id);
  const all = readBills().filter((b) => b.id !== bill.id);
  writeBills([bill, ...all]);
  void syncMasterRecord({ type: "bills", action: "upsert", data: billSheetRow(bill) });
  appendAuditEntry({
    action: existed ? "edit" : "create",
    recordType: "bills",
    recordId: bill.id,
    documentNo: bill.invoiceNo,
    summary: `Bill ${bill.invoiceNo} — ${bill.plantLabel}, ${bill.month}`,
    before: {},
    after: billAuditSnapshot(bill),
  });
  return bill;
}

export function deleteBill(id: string): boolean {
  const all = readBills();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  const removed = all[idx];
  all.splice(idx, 1);
  writeBills(all);
  void syncMasterRecord({ type: "bills", action: "delete", id });
  appendAuditEntry({
    action: "delete",
    recordType: "bills",
    recordId: id,
    documentNo: removed.invoiceNo,
    summary: `Deleted bill ${removed.invoiceNo} — ${removed.plantLabel}, ${removed.month}`,
    before: billAuditSnapshot(removed),
  });
  return true;
}

/** Next invoice number per company — highest numeric invoice no + 1. */
export function suggestNextInvoiceNo(companyId: string): string {
  const numbers = readBills()
    .filter((b) => b.companyId === companyId)
    .map((b) => Number(b.invoiceNo))
    .filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return "";
  return String(Math.max(...numbers) + 1);
}

/** An already-saved bill for the same company + plant + category + month. */
export function findExistingBill(
  companyId: string,
  plantType: string,
  categoryId: string,
  month: string,
  excludeId?: string
): SavedBill | undefined {
  return readBills().find(
    (b) =>
      b.id !== excludeId &&
      b.companyId === companyId &&
      b.plantType === plantType &&
      b.categoryId === categoryId &&
      b.month === month
  );
}

export function onBillsUpdate(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(BILL_UPDATE_EVENT, handler);
  return () => window.removeEventListener(BILL_UPDATE_EVENT, handler);
}

/**
 * Infra & Crusher bills — stored separately from Cargo's SavedBill (own
 * localStorage key/event, own invoice-number sequence) but synced through
 * the same "Bills" Google Sheet tab, tagged `moduleType: "infra"` in the
 * billJson snapshot so reload can tell the two apart (see
 * replaceWithSheetBills above).
 */
export interface SavedInfraBill {
  id: string;
  moduleType: "infra";
  companyId: string;
  invoiceNo: string;
  invoiceDate: string;
  /** Billing month, YYYY-MM */
  month: string;
  clientRef: string;
  clientName: string;
  clientAddress: string;
  clientGstNo: string;
  shippingName: string;
  shippingAddress: string;
  projectCode: string;
  projectName: string;
  materialType: string;
  hsnNo: string;
  gstPercent: number;
  lines: InfraBillLineItem[];
  rateGroups: RateGroup[];
  totals: BillTotals;
  createdAt: string;
}

const INFRA_BILLS_KEY = "sahyadri_erp_infra_bills";
const INFRA_BILL_UPDATE_EVENT = "sahyadri-infra-bill-update";

function readInfraBills(): SavedInfraBill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INFRA_BILLS_KEY);
    return raw ? (JSON.parse(raw) as SavedInfraBill[]) : [];
  } catch {
    return [];
  }
}

function writeInfraBills(bills: SavedInfraBill[]) {
  localStorage.setItem(INFRA_BILLS_KEY, JSON.stringify(bills));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(INFRA_BILL_UPDATE_EVENT));
  }
}

export function getAllInfraBills(): SavedInfraBill[] {
  return readInfraBills();
}

export function getInfraBillById(id: string): SavedInfraBill | undefined {
  return readInfraBills().find((b) => b.id === id);
}

/**
 * Flat one-row summary for the shared "Bills" tab — reuses Cargo's fixed
 * 22-column schema with a documented remapping (no backend column change
 * needed): `plant` holds a fixed label, `category` holds the material type,
 * `customerPin` holds the project code (no PIN concept for Infra clients),
 * and `totalWeightKg` holds the total Brass quantity. The full
 * `SavedInfraBill` (including `moduleType`) lives in `billJson` and is the
 * real source of truth on reload.
 */
function infraBillSheetRow(bill: SavedInfraBill): Record<string, unknown> {
  return {
    id: bill.id,
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    month: bill.month,
    company: companyName(bill.companyId),
    plant: "Infra & Crusher",
    category: bill.materialType,
    hsnNo: bill.hsnNo,
    customerName: bill.clientName,
    customerAddress: bill.shippingAddress,
    customerPin: bill.projectCode,
    customerGst: bill.clientGstNo,
    gstPercent: bill.gstPercent,
    rateSummary: bill.rateGroups
      .map((g) => `${g.qty} Brass @ ${g.rate} = ${g.amount}`)
      .join("; "),
    totalWeightKg: totalQtyBrass(bill.lines),
    subTotal: bill.totals.subTotal,
    cgst: bill.totals.cgst,
    sgst: bill.totals.sgst,
    grandTotal: bill.totals.grandTotal,
    description: bill.projectName,
    lineCount: bill.lines.length,
    createdAt: bill.createdAt,
    billJson: JSON.stringify(bill),
  };
}

/** Replaces the local Infra bill cache with rows fetched from the shared
 * "Bills" tab whose snapshot is tagged `moduleType: "infra"`. */
export function replaceWithSheetInfraBills(rows: Record<string, unknown>[]): void {
  const bills: SavedInfraBill[] = [];
  for (const row of rows) {
    const raw = row.billJson;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw) as SavedInfraBill & { moduleType?: string };
      if (parsed.moduleType !== "infra") continue;
      if (parsed && parsed.id && Array.isArray(parsed.lines)) bills.push(parsed);
    } catch {
      // malformed cell — skip the row rather than break hydration
    }
  }
  writeInfraBills(bills);
}

function infraBillAuditSnapshot(bill: SavedInfraBill): Record<string, string | number> {
  return {
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    company: companyName(bill.companyId),
    clientName: bill.clientName,
    materialType: bill.materialType,
    month: bill.month,
    lineCount: bill.lines.length,
    grandTotal: bill.totals.grandTotal,
  };
}

export function saveInfraBill(bill: SavedInfraBill): SavedInfraBill {
  const existed = readInfraBills().some((b) => b.id === bill.id);
  const all = readInfraBills().filter((b) => b.id !== bill.id);
  writeInfraBills([bill, ...all]);
  void syncMasterRecord({ type: "bills", action: "upsert", data: infraBillSheetRow(bill) });
  appendAuditEntry({
    action: existed ? "edit" : "create",
    recordType: "bills",
    recordId: bill.id,
    documentNo: bill.invoiceNo,
    summary: `Infra bill ${bill.invoiceNo} — ${bill.clientName}, ${bill.materialType}, ${bill.month}`,
    before: {},
    after: infraBillAuditSnapshot(bill),
  });
  return bill;
}

export function deleteInfraBill(id: string): boolean {
  const all = readInfraBills();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  const removed = all[idx];
  all.splice(idx, 1);
  writeInfraBills(all);
  void syncMasterRecord({ type: "bills", action: "delete", id });
  appendAuditEntry({
    action: "delete",
    recordType: "bills",
    recordId: id,
    documentNo: removed.invoiceNo,
    summary: `Deleted infra bill ${removed.invoiceNo} — ${removed.clientName}, ${removed.month}`,
    before: infraBillAuditSnapshot(removed),
  });
  return true;
}

/** Next invoice number per company — its own sequence, independent of
 * Cargo's (per the user's choice: Infra & Crusher invoices run separately). */
export function suggestNextInfraInvoiceNo(companyId: string): string {
  const numbers = readInfraBills()
    .filter((b) => b.companyId === companyId)
    .map((b) => Number(b.invoiceNo))
    .filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return "";
  return String(Math.max(...numbers) + 1);
}

/** An already-saved bill for the same company + client/project + material + month. */
export function findExistingInfraBill(
  companyId: string,
  clientRef: string,
  materialType: string,
  month: string,
  excludeId?: string
): SavedInfraBill | undefined {
  return readInfraBills().find(
    (b) =>
      b.id !== excludeId &&
      b.companyId === companyId &&
      b.clientRef === clientRef &&
      b.materialType === materialType &&
      b.month === month
  );
}

export function onInfraBillsUpdate(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(INFRA_BILL_UPDATE_EVENT, handler);
  return () => window.removeEventListener(INFRA_BILL_UPDATE_EVENT, handler);
}
