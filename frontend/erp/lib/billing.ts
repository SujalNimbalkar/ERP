import { getLocalRecordsByType } from "./localStore";
import { materialBelongsToCategory } from "./billingConfig";
import type { CargoSourceType } from "./sheetConfig";

/**
 * Bill computation — turns saved cargo trip lines into monthly bill data:
 * detail line items (page 2) and rate-wise summary groups + GST (page 1).
 */

export interface BillLineItem {
  invoiceDate: string;
  invoiceNo: string;
  invoiceQty: number;
  materialCode: string;
  materialDescription: string;
  plantCode: string;
  vehicleNo: string;
  lrNo: string;
  perPartWt: number | null;
  totalWt: number;
  ratePerKg: number | null;
  amount: number;
}

export interface RateGroup {
  rate: number;
  /** Billed quantity for this rate — total weight in kg */
  qty: number;
  amount: number;
}

export interface BillTotals {
  subTotal: number;
  cgst: number;
  sgst: number;
  grandTotal: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asNumber(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Trips recorded before the Billing Company field existed carry no tag —
 * they match any company so old data still lands on a bill.
 */
function matchesCompany(record: { data: Record<string, string | number> }, companyId: string): boolean {
  const tagged = String(record.data.billingCompany ?? "").trim();
  return tagged === "" || tagged === companyId;
}

/**
 * Collects the trip lines for one company, plant, month (YYYY-MM), and bill
 * category. One saved record = one material line of one invoice/trip.
 */
export function collectBillLines(
  companyId: string,
  plantType: CargoSourceType,
  month: string,
  categoryId: string,
  plantCode: string
): BillLineItem[] {
  if (!month) return [];
  return getLocalRecordsByType(plantType)
    .filter((record) => {
      if (!matchesCompany(record, companyId)) return false;
      const date = String(record.data.date ?? "");
      if (!date.startsWith(month)) return false;
      return materialBelongsToCategory(String(record.data.materialCode ?? ""), categoryId);
    })
    .map((record) => {
      const totalWt = asNumber(record.data.totalWt);
      const rate = asNumber(record.data.transportRate);
      const storedAmount = asNumber(record.data.transportAmount);
      return {
        invoiceDate: String(record.data.date ?? ""),
        invoiceNo: String(record.data.documentNo ?? ""),
        invoiceQty: asNumber(record.data.quantity),
        materialCode: String(record.data.materialCode ?? ""),
        materialDescription: String(record.data.materialDescription ?? ""),
        plantCode,
        vehicleNo: String(record.data.vehicleNo ?? ""),
        lrNo: String(record.data.lrNo ?? ""),
        perPartWt: record.data.perPartWt !== undefined ? asNumber(record.data.perPartWt) : null,
        totalWt,
        ratePerKg: rate || null,
        amount: storedAmount || round2(totalWt * rate),
      };
    })
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
}

/** Rate-wise groups for page 1 — one summary row per distinct Rs/kg rate. */
export function buildRateGroups(lines: BillLineItem[]): RateGroup[] {
  const groups = new Map<number, RateGroup>();
  for (const line of lines) {
    const rate = line.ratePerKg ?? 0;
    const group = groups.get(rate) ?? { rate, qty: 0, amount: 0 };
    group.qty += line.totalWt;
    group.amount += line.amount;
    groups.set(rate, group);
  }
  return Array.from(groups.values())
    .map((g) => ({ rate: g.rate, qty: Math.round(g.qty * 1000) / 1000, amount: round2(g.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeBillTotals(lines: BillLineItem[], gstPercent: number): BillTotals {
  const subTotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const cgst = round2((subTotal * gstPercent) / 200);
  const sgst = round2((subTotal * gstPercent) / 200);
  return { subTotal, cgst, sgst, grandTotal: round2(subTotal + cgst + sgst) };
}

export function totalWeight(lines: BillLineItem[]): number {
  return round2(lines.reduce((sum, line) => sum + line.totalWt, 0));
}

export function totalQuantity(lines: BillLineItem[]): number {
  return round2(lines.reduce((sum, line) => sum + line.invoiceQty, 0));
}

/**
 * Default bill description from the actual routes driven that month —
 * one "From X TO Y" line per distinct route.
 */
export function suggestBillDescription(
  companyId: string,
  plantType: CargoSourceType,
  month: string,
  categoryId: string
): string {
  const routes = new Set<string>();
  for (const record of getLocalRecordsByType(plantType)) {
    if (!matchesCompany(record, companyId)) continue;
    const date = String(record.data.date ?? "");
    if (!date.startsWith(month)) continue;
    if (!materialBelongsToCategory(String(record.data.materialCode ?? ""), categoryId)) continue;
    const from = String(record.data.fromLocation ?? "").trim();
    const to = String(record.data.toParty ?? "").trim();
    if (from || to) routes.add(`From ${from} To ${to}`);
  }
  if (routes.size === 0) return "Material Transportation Charges";
  return `Material Transportation Charges ${Array.from(routes).join("\n")}`;
}

/** "2026-04" → "April 2026" */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/** "2026-04-08" → "08.04.2026" (invoice date style used on the bills) */
export function formatBillDate(date: string): string {
  const [year, m, d] = date.split("-");
  if (!year || !m || !d) return date;
  return `${d}.${m}.${year}`;
}

/** "2026-04-08" → "8/Apr" (detail table style) */
export function formatDetailDate(date: string): string {
  const [year, m, d] = date.split("-").map(Number);
  if (!year || !m || !d) return date;
  return `${d}/${new Date(year, m - 1, d).toLocaleString("en-IN", { month: "short" })}`;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}
