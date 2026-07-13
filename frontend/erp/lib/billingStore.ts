import { syncMasterRecord } from "./api";
import { appendAuditEntry } from "./auditLog";
import { totalWeight, type BillLineItem, type RateGroup, type BillTotals } from "./billing";
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
 * Each row's billJson column holds the full SavedBill snapshot.
 */
export function replaceWithSheetBills(rows: Record<string, unknown>[]): void {
  const bills: SavedBill[] = [];
  for (const row of rows) {
    const raw = row.billJson;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const bill = JSON.parse(raw) as SavedBill;
      if (bill && bill.id && Array.isArray(bill.lines)) bills.push(bill);
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
