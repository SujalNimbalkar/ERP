"use client";

import {
  lineGrossAmount,
  lineGstAmount,
  totalGross,
  totalNet,
  totalQtyBrass,
} from "@/lib/infraBilling";
import { formatBillDate, formatMoney, formatMonthLabel, formatQty } from "@/lib/billing";
import type { SavedInfraBill } from "@/lib/billingStore";
import { CompanyHeader } from "@/components/billing/BillPreview";

/** Bill contents without storage metadata — used for live preview and saved bills alike. */
export type InfraBillData = Omit<SavedInfraBill, "id" | "createdAt">;

const cell = "border border-black px-2 py-1 align-top";
const cellRight = `${cell} text-right`;

function CustomerBlock({ bill, dateLabel }: { bill: InfraBillData; dateLabel: string }) {
  const projectLabel = [bill.projectCode, bill.projectName].filter(Boolean).join("-");
  const shippingLabel = [bill.shippingName, bill.shippingAddress].filter(Boolean).join(", ");
  return (
    <div className="flex border border-black border-t-0 text-sm">
      <div className="flex flex-1">
        <p className="w-36 border-r border-black px-2 py-1 font-semibold">Customer Details</p>
        <div className="flex-1 px-2 py-1">
          <p className="font-semibold">{bill.clientName}</p>
          <p className="whitespace-pre-line">{bill.clientAddress}</p>
          {bill.clientGstNo && <p>GST No {bill.clientGstNo}</p>}
        </div>
      </div>
      <div className="w-96 border-l border-black">
        <p className="border-b border-black px-2 py-1">Date – {dateLabel}</p>
        <p className="border-b border-black px-2 py-1">Invoice No – {bill.invoiceNo}</p>
        {shippingLabel && (
          <p className="border-b border-black px-2 py-1">
            <span className="font-semibold">Shipping –</span> {shippingLabel}
          </p>
        )}
        {projectLabel && (
          <p className="px-2 py-1">
            <span className="font-semibold">Project Code &amp; Name –</span> {projectLabel}
          </p>
        )}
      </div>
    </div>
  );
}

/** Page 1 — tax invoice summary, one row per distinct Rs/Brass rate. */
function SummaryPage({ bill }: { bill: InfraBillData }) {
  const halfGst = bill.gstPercent / 2;
  return (
    <section className="bill-page bg-white p-4 text-black">
      <p className="border border-black px-2 py-1 text-center text-lg font-semibold">
        TAX INVOICE
      </p>
      <CompanyHeader bill={bill} />
      <CustomerBlock bill={bill} dateLabel={formatBillDate(bill.invoiceDate)} />

      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${cell} w-10 text-center`}>Sr.No</th>
            <th className={`${cell} text-center`}>Description of Goods</th>
            <th className={`${cell} w-24 text-center`}>HSN/SAC</th>
            <th className={`${cell} w-24 text-center`}>Quantity (In Brass)</th>
            <th className={`${cell} w-24 text-center`}>Rate (Per Brass)</th>
            <th className={`${cell} w-28 text-center`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.rateGroups.length === 0 ? (
            <tr>
              <td className={cell} colSpan={6}>
                No trips found for this month.
              </td>
            </tr>
          ) : (
            bill.rateGroups.map((group, index) => (
              <tr key={group.rate}>
                <td className={`${cell} text-center`}>{index + 1}</td>
                <td className={cell}>{bill.materialType}</td>
                <td className={cell}>{bill.hsnNo}</td>
                <td className={cellRight}>{formatQty(group.qty)}</td>
                <td className={cellRight}>{group.rate}</td>
                <td className={cellRight}>{formatMoney(group.amount)}</td>
              </tr>
            ))
          )}
          <tr>
            <td className={cell} colSpan={5}>
              <span className="font-semibold">Total</span>
            </td>
            <td className={`${cellRight} font-semibold`}>{formatMoney(bill.totals.subTotal)}</td>
          </tr>
          <tr>
            <td className={cell} colSpan={5}>
              CGST {halfGst}%
            </td>
            <td className={cellRight}>{formatMoney(bill.totals.cgst)}</td>
          </tr>
          <tr>
            <td className={cell} colSpan={5}>
              SGST {halfGst}%
            </td>
            <td className={cellRight}>{formatMoney(bill.totals.sgst)}</td>
          </tr>
          <tr>
            <td className={cell} colSpan={5}>
              <span className="font-semibold">Total</span>
            </td>
            <td className={`${cellRight} font-semibold`}>{formatMoney(bill.totals.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Page 2 — receipt-wise detail sheet, matching the customer's own tracking format. */
function DetailPage({ bill }: { bill: InfraBillData }) {
  const monthLabel = formatMonthLabel(bill.month);
  return (
    <section className="bill-page mt-6 bg-white p-4 text-black">
      <p className="border border-black px-2 py-1 text-center text-lg font-semibold">
        Detail Bill for the Month of {monthLabel}
      </p>
      <CompanyHeader bill={bill} />
      <CustomerBlock bill={bill} dateLabel={formatBillDate(bill.invoiceDate)} />

      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr>
            {["Receipt No", "Vehicle No", "Date", "Material", "Brass", "Rate", "Net", "GST", "Gross"].map(
              (label) => (
                <th key={label} className={`${cell} text-center font-semibold`}>
                  {label}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {bill.lines.length === 0 ? (
            <tr>
              <td className={cell} colSpan={9}>
                No trips found for this month.
              </td>
            </tr>
          ) : (
            bill.lines.map((line, index) => (
              <tr key={`${line.receiptNo}-${index}`}>
                <td className={cell}>{line.receiptNo}</td>
                <td className={cell}>{line.vehicleNo}</td>
                <td className={cell}>{formatBillDate(line.date)}</td>
                <td className={cell}>{line.materialType}</td>
                <td className={cellRight}>{formatQty(line.qtyBrass)}</td>
                <td className={cellRight}>
                  {line.ratePerBrass != null ? line.ratePerBrass : ""}
                </td>
                <td className={cellRight}>{formatMoney(line.netAmount)}</td>
                <td className={cellRight}>
                  {formatMoney(lineGstAmount(line.netAmount, bill.gstPercent))}
                </td>
                <td className={cellRight}>
                  {formatMoney(lineGrossAmount(line.netAmount, bill.gstPercent))}
                </td>
              </tr>
            ))
          )}
          {bill.lines.length > 0 && (
            <tr className="font-semibold">
              <td className={cell} colSpan={4}>
                Total
              </td>
              <td className={cellRight}>{formatQty(totalQtyBrass(bill.lines))}</td>
              <td className={cell} />
              <td className={cellRight}>{formatMoney(totalNet(bill.lines))}</td>
              <td className={cellRight}>
                {formatMoney(bill.lines.reduce((sum, l) => sum + lineGstAmount(l.netAmount, bill.gstPercent), 0))}
              </td>
              <td className={cellRight}>{formatMoney(totalGross(bill.lines, bill.gstPercent))}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export function InfraBillPreview({ bill }: { bill: InfraBillData }) {
  return (
    <div className="bill-print-area">
      <SummaryPage bill={bill} />
      <DetailPage bill={bill} />
    </div>
  );
}
