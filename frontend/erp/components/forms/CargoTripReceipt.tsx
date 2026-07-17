"use client";

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toJpeg } from "html-to-image";
import { companyName } from "@/lib/companies";
import type { LocalRecord } from "@/lib/types";

/**
 * A trip's review/receipt — the visual content shown in Cargo Transport's
 * Confirm & Save dialog, and independently re-rendered (from a saved row's
 * own data, not live form state) whenever a Saved Records edit needs to
 * regenerate the receipt image. Both callers build this same plain-data
 * shape so the two code paths never drift apart.
 */
export interface CargoReceiptLine {
  materialCode: string;
  materialDescription: string;
  quantity: string;
  uom: string;
  totalWt: string;
  receivedQty?: string;
}

export interface CargoReceiptInvoice {
  documentNo: string;
  date: string;
  receivedDate?: string;
  routeLabel: string;
  lines: CargoReceiptLine[];
}

export interface CargoReceiptData {
  billingCompanyLabel: string;
  vehicleNo: string;
  lrNo?: string;
  driverLabel?: string;
  invoices: CargoReceiptInvoice[];
  totalWeightLabel: string;
  rateLabel?: string;
  amountLabel: string;
  dieselFillRef?: string;
  dieselUsedThisTrip?: string;
  tollOverloadAmount?: string;
}

export function ReviewRow({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="flex gap-2 text-xs text-black">
      <span className="w-32 shrink-0 font-medium">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function CargoTripReceipt({ data }: { data: CargoReceiptData }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-semibold text-black">Trip Details</p>
        <ReviewRow label="Billing Company" value={data.billingCompanyLabel} />
        <ReviewRow label="Vehicle No." value={data.vehicleNo} />
        <ReviewRow label="L.R. No." value={data.lrNo} />
        <ReviewRow label="Driver" value={data.driverLabel} />
      </div>

      {data.invoices.map((invoice, index) => (
        <div key={`${invoice.documentNo}-${index}`}>
          <p className="mb-1 text-xs font-semibold text-black">
            Invoice {index + 1} — {invoice.documentNo || "(no number)"}
            {invoice.date ? `, ${invoice.date}` : ""}
            {invoice.receivedDate ? ` · received ${invoice.receivedDate}` : ""}
          </p>
          <ReviewRow label="Route" value={invoice.routeLabel} />
          <div className="overflow-hidden rounded-md border border-black/10">
            <table className="w-full border-collapse text-xs text-black">
              <thead>
                <tr className="bg-page">
                  <th className="px-1.5 py-1 text-left font-semibold">Material</th>
                  <th className="px-1.5 py-1 text-right font-semibold">Qty</th>
                  <th className="px-1.5 py-1 text-right font-semibold">Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, lineIndex) => (
                  <tr key={`${line.materialCode}-${lineIndex}`} className="border-t border-black/10">
                    <td className="px-1.5 py-1">
                      {line.materialCode}
                      {line.materialDescription ? ` — ${line.materialDescription}` : ""}
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      {line.quantity} {line.uom}
                      {line.receivedQty ? ` (recd ${line.receivedQty})` : ""}
                    </td>
                    <td className="px-1.5 py-1 text-right">{line.totalWt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div>
        <p className="mb-1 text-xs font-semibold text-black">Transport</p>
        <ReviewRow label="Total Weight" value={data.totalWeightLabel} />
        <ReviewRow label="Rate" value={data.rateLabel} />
        <ReviewRow label="Amount" value={data.amountLabel} />
      </div>

      {(data.dieselFillRef || data.dieselUsedThisTrip || data.tollOverloadAmount) && (
        <div>
          <p className="mb-1 text-xs font-semibold text-black">Expenses</p>
          <ReviewRow label="Diesel Fill Ref" value={data.dieselFillRef} />
          <ReviewRow label="Diesel Used (Rs)" value={data.dieselUsedThisTrip} />
          <ReviewRow label="Toll + Overload (Rs)" value={data.tollOverloadAmount} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders CargoTripReceipt into a detached, off-screen DOM node and
 * captures it as a JPEG data URL — independent of whatever's currently
 * mounted/visible, so there's no timing dependency on a dialog staying
 * open. Used both by CargoTransportForm (live form state, on save) and
 * RecordsView (reconstructed from saved rows, on edit).
 */
export async function captureCargoReceipt(data: CargoReceiptData): Promise<string> {
  const container = document.createElement("div");
  // Must stay within the actual viewport (not pushed off-screen, not
  // opacity:0) — html-to-image silently rasterizes blank content for
  // elements outside the visible viewport bounds or with opacity 0, even
  // though layout/sizing still computes correctly (confirmed by testing:
  // an off-screen or opacity:0 copy of identical content captured at ~1.5KB
  // — effectively blank — versus ~6.5KB for the same content genuinely in
  // view). Staying in-viewport but z-index'd behind everything else, with
  // pointer-events disabled, keeps it invisible to the user without
  // triggering that blank-capture bug.
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "-9999";
  container.style.pointerEvents = "none";
  container.style.width = "420px";
  container.style.background = "#ffffff";
  container.style.padding = "12px";
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    flushSync(() => {
      root.render(<CargoTripReceipt data={data} />);
    });
    return await toJpeg(container, {
      quality: 0.85,
      backgroundColor: "#ffffff",
      pixelRatio: 1.5,
    });
  } finally {
    root.unmount();
    container.remove();
  }
}

/**
 * Reconstructs CargoReceiptData from already-saved "cargo" LocalRecords —
 * one row per material line, grouped back into invoices by documentNo.
 * Used when regenerating a receipt image from Saved Records, where there's
 * no live form state, only the flat rows as saved to the Sheet.
 */
export function buildCargoReceiptDataFromRows(
  rows: LocalRecord[],
  overrides?: { dieselUsedThisTrip?: string; tollOverloadAmount?: string; dieselFillRef?: string }
): CargoReceiptData {
  const first = rows[0]?.data ?? {};
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

  const byDocumentNo = new Map<string, LocalRecord[]>();
  for (const row of rows) {
    const key = str(row.data.documentNo);
    const group = byDocumentNo.get(key) ?? [];
    group.push(row);
    byDocumentNo.set(key, group);
  }

  const invoices: CargoReceiptInvoice[] = Array.from(byDocumentNo.entries()).map(
    ([documentNo, groupRows]) => {
      const firstRow = groupRows[0].data;
      return {
        documentNo,
        date: str(firstRow.date),
        receivedDate: str(firstRow.receivedDate) || undefined,
        routeLabel: `${str(firstRow.fromLocation)} → ${str(firstRow.toParty)}`,
        lines: groupRows.map((r) => ({
          materialCode: str(r.data.materialCode),
          materialDescription: str(r.data.materialDescription),
          quantity: str(r.data.quantity),
          uom: str(r.data.uom),
          totalWt: str(r.data.totalWt),
          receivedQty: str(r.data.receivedQty) || undefined,
        })),
      };
    }
  );

  const totalWeight = rows.reduce((sum, r) => sum + (Number(r.data.totalWt) || 0), 0);
  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.data.transportAmount) || 0), 0);

  const rates = new Set(rows.map((r) => `${str(r.data.transportRate)}|${str(r.data.rateTier)}`));
  const rateLabel =
    rates.size === 1
      ? (() => {
          const [rate, tier] = Array.from(rates)[0].split("|");
          return rate ? `${rate}${tier ? ` (${tier})` : ""}` : undefined;
        })()
      : undefined;

  return {
    billingCompanyLabel: companyName(str(first.billingCompany)) || str(first.billingCompany),
    vehicleNo: str(first.vehicleNo),
    lrNo: str(first.lrNo) || undefined,
    driverLabel: str(first.driverName) || str(first.driverId) || undefined,
    invoices,
    totalWeightLabel: `${Math.round(totalWeight * 1000) / 1000} kg`,
    rateLabel,
    amountLabel: `Rs ${Math.round(totalAmount * 100) / 100}`,
    dieselFillRef: overrides?.dieselFillRef ?? str(first.dieselFillRef) ?? undefined,
    dieselUsedThisTrip: overrides?.dieselUsedThisTrip,
    tollOverloadAmount: overrides?.tollOverloadAmount,
  };
}
