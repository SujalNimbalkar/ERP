import { getLocalRecordsByType } from "./localStore";
import { asNumber, round2, type RateGroup } from "./billing";

/**
 * Infra & Crusher bill computation — turns saved Infra trips into monthly
 * bill data, mirroring lib/billing.ts but priced in Brass (not Kg) and
 * grouped by client + material type instead of plant + bill category
 * (Infra bills are always one material per bill — Csand, Psand, Khadi,
 * Dabar, etc. each get their own invoice).
 */

export interface InfraBillLineItem {
  date: string;
  receiptNo: string;
  vehicleNo: string;
  materialType: string;
  qtyBrass: number;
  ratePerBrass: number | null;
  /** Sale amount before GST — qtyBrass x ratePerBrass. GST/Gross are derived
   * per line at render time from the bill's own gstPercent (see
   * lineGstAmount/lineGrossAmount below), not stored here. */
  netAmount: number;
}

/**
 * Matches a trip to the bill being generated. Rows saved after the Client
 * Companies picker carry `clientRef` (the reliable join key); older rows
 * have none, so they fall back to a case-insensitive `customerName` match —
 * same "untagged rows match anything" rule Cargo billing already applies to
 * `billingCompany` in billing.ts's `matchesCompany`.
 */
function matchesClient(
  data: Record<string, string | number>,
  clientRef: string,
  customerNameFallback: string
): boolean {
  const rowRef = String(data.clientRef ?? "").trim();
  if (rowRef) return rowRef === clientRef;
  if (!clientRef) return false;
  const name = String(data.customerName ?? "").trim().toLowerCase();
  const fallback = customerNameFallback.trim().toLowerCase();
  return name !== "" && name === fallback;
}

/**
 * Collects the trip lines for one client/project, material type, and month
 * (YYYY-MM). One saved Infra trip = one bill line.
 */
export function collectInfraBillLines(
  clientRef: string,
  customerNameFallback: string,
  materialType: string,
  month: string
): InfraBillLineItem[] {
  if (!month || !materialType) return [];
  const wantedType = materialType.trim();
  return getLocalRecordsByType("infra")
    .filter((record) => {
      const data = record.data;
      const date = String(data.date ?? "");
      if (!date.startsWith(month)) return false;
      if (String(data.materialType ?? "").trim() !== wantedType) return false;
      return matchesClient(data, clientRef, customerNameFallback);
    })
    .map((record) => {
      const data = record.data;
      const qtyBrass = asNumber(data.qtyBrass);
      const rate = asNumber(data.rate);
      const storedTotal = asNumber(data.totalAmount);
      return {
        date: String(data.date ?? ""),
        receiptNo: String(data.challanNo ?? ""),
        vehicleNo: String(data.vehicleNo ?? ""),
        materialType: String(data.materialType ?? ""),
        qtyBrass,
        ratePerBrass: rate || null,
        netAmount: storedTotal || round2(qtyBrass * rate),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Rate-wise groups for page 1 — one summary row per distinct Rs/Brass rate. */
export function buildInfraRateGroups(lines: InfraBillLineItem[]): RateGroup[] {
  const groups = new Map<number, RateGroup>();
  for (const line of lines) {
    const rate = line.ratePerBrass ?? 0;
    const group = groups.get(rate) ?? { rate, qty: 0, amount: 0 };
    group.qty += line.qtyBrass;
    group.amount += line.netAmount;
    groups.set(rate, group);
  }
  return Array.from(groups.values())
    .map((g) => ({ rate: g.rate, qty: Math.round(g.qty * 1000) / 1000, amount: round2(g.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export function lineGstAmount(netAmount: number, gstPercent: number): number {
  return round2((netAmount * gstPercent) / 100);
}

export function lineGrossAmount(netAmount: number, gstPercent: number): number {
  return round2(netAmount + lineGstAmount(netAmount, gstPercent));
}

export function totalQtyBrass(lines: InfraBillLineItem[]): number {
  return round2(lines.reduce((sum, line) => sum + line.qtyBrass, 0));
}

export function totalNet(lines: InfraBillLineItem[]): number {
  return round2(lines.reduce((sum, line) => sum + line.netAmount, 0));
}

export function totalGross(lines: InfraBillLineItem[], gstPercent: number): number {
  return round2(lines.reduce((sum, line) => sum + lineGrossAmount(line.netAmount, gstPercent), 0));
}

/** Distinct material types billed to this client — the category-equivalent
 * select on the Infra & Crusher billing form. */
export function getInfraMaterialTypes(clientRef: string, customerNameFallback: string): string[] {
  const types = new Set<string>();
  for (const record of getLocalRecordsByType("infra")) {
    if (!matchesClient(record.data, clientRef, customerNameFallback)) continue;
    const type = String(record.data.materialType ?? "").trim();
    if (type) types.add(type);
  }
  return Array.from(types).sort();
}
