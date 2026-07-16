"use client";

import {
  formatBillDate,
  formatDetailDate,
  formatMoney,
  formatMonthLabel,
  formatQty,
  totalQuantity,
  totalWeight,
} from "@/lib/billing";
import { findBillCategory, findCompany } from "@/lib/billingConfig";
import type { SavedBill } from "@/lib/billingStore";

/** Bill contents without storage metadata — used for live preview and saved bills alike. */
export type BillData = Omit<SavedBill, "id" | "createdAt">;

const cell = "border border-black px-2 py-1 align-top";
const cellRight = `${cell} text-right`;

/** Reused as-is by InfraBillPreview.tsx — letterhead rendering is identical
 * across bill types, generic over `findCompany(bill.companyId)`. */
export function CompanyHeader({ bill }: { bill: { companyId: string } }) {
  const company = findCompany(bill.companyId);
  if (!company) return null;
  return (
    <>
      {company.headerImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- static letterhead must print pixel-identical
        <img
          src={company.headerImage}
          alt={company.name}
          className="w-full border border-black"
        />
      ) : (
        <>
          {company.tagline && (
            <p className="text-center text-xs">{company.tagline}</p>
          )}
          <h2 className="border border-black px-2 py-1 text-center text-2xl font-bold">
            {company.name}
          </h2>
        </>
      )}
      <p className="border border-black border-t-0 px-2 py-0.5 text-center text-sm">
        {company.addressLine}
      </p>
      <div className="flex border border-black border-t-0 text-sm">
        <p className="flex-1 px-2 py-0.5 text-center">
          {company.proprietor}
          {company.mobile ? ` Mob. No. ${company.mobile}` : ""}
        </p>
        <p className="w-64 border-l border-black px-2 py-0.5">GST No. {company.gstNo}</p>
      </div>
    </>
  );
}

function CustomerBlock({ bill, dateLabel }: { bill: BillData; dateLabel: string }) {
  return (
    <div className="flex border border-black border-t-0 text-sm">
      <div className="flex flex-1">
        <p className="w-36 border-r border-black px-2 py-1 font-semibold">
          Name &amp; Address
        </p>
        <div className="flex-1 px-2 py-1">
          <p className="font-semibold">{bill.customer.name}</p>
          <p>{bill.customer.address}</p>
          <p>{bill.customer.pin}</p>
          <p>GST No. {bill.customer.gstNo}</p>
        </div>
      </div>
      <div className="w-64 border-l border-black">
        <p className="border-b border-black px-2 py-1">Invoice No - {bill.invoiceNo}</p>
        <p className="border-b border-black px-2 py-1">Date - {dateLabel}</p>
        <p className="px-2 py-1">HSN No. {bill.hsnNo}</p>
      </div>
    </div>
  );
}

/** Page 1 — tax invoice summary with rate-wise rows and GST. */
function SummaryPage({ bill }: { bill: BillData }) {
  const monthLabel = formatMonthLabel(bill.month);
  const halfGst = bill.gstPercent / 2;
  return (
    <section className="bill-page bg-white p-4 text-black">
      <p className="border border-black px-2 py-1 text-center text-lg font-semibold">
        TAX INVOICE
      </p>
      <CompanyHeader bill={bill} />
      <p className="border border-black border-t-0 px-2 py-0.5 text-center text-sm font-semibold">
        Customer Details
      </p>
      <CustomerBlock bill={bill} dateLabel={formatBillDate(bill.invoiceDate)} />

      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${cell} text-center`}>Description</th>
            <th className={`${cell} w-24 text-center`}>Qty</th>
            <th className={`${cell} w-16 text-center`}>Rate</th>
            <th className={`${cell} w-28 text-center`}>Amount Rs.</th>
          </tr>
        </thead>
        <tbody>
          {bill.rateGroups.length === 0 ? (
            <tr>
              <td className={cell} colSpan={4}>
                No trips found for this month.
              </td>
            </tr>
          ) : (
            bill.rateGroups.map((group, index) => (
              <tr key={group.rate}>
                {index === 0 && (
                  <td className={cell} rowSpan={bill.rateGroups.length}>
                    <p className="font-semibold underline">
                      For the Month of {monthLabel}
                    </p>
                    <p className="mt-2 whitespace-pre-line">{bill.description}</p>
                    <p className="mt-2 font-semibold">FREIGHT CHARGES</p>
                  </td>
                )}
                <td className={cellRight}>{formatQty(group.qty)}</td>
                <td className={cellRight}>{group.rate}</td>
                <td className={cellRight}>{formatMoney(group.amount)}</td>
              </tr>
            ))
          )}
          <tr>
            <td className="border-0" />
            <td className={`${cell} font-semibold text-right`} colSpan={2}>
              Total
            </td>
            <td className={`${cellRight} font-semibold`}>
              {formatMoney(bill.totals.subTotal)}
            </td>
          </tr>
          <tr>
            <td className="border-0" />
            <td className={`${cell} text-right`} colSpan={2}>
              CGST {halfGst}%
            </td>
            <td className={cellRight}>{formatMoney(bill.totals.cgst)}</td>
          </tr>
          <tr>
            <td className="border-0" />
            <td className={`${cell} text-right`} colSpan={2}>
              SGST {halfGst}%
            </td>
            <td className={cellRight}>{formatMoney(bill.totals.sgst)}</td>
          </tr>
          <tr>
            <td className="border-0" />
            <td className={`${cell} font-semibold text-right`} colSpan={2}>
              Total
            </td>
            <td className={`${cellRight} font-semibold`}>
              {formatMoney(bill.totals.grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Page 2 — trip-wise detail table. */
function DetailPage({ bill }: { bill: BillData }) {
  const monthLabel = formatMonthLabel(bill.month);
  const detailTitle = findBillCategory(bill.categoryId)?.detailTitle ?? "Detail Bill";
  return (
    <section className="bill-page mt-6 bg-white p-4 text-black">
      <p className="border border-black px-2 py-1 text-center text-lg font-semibold">
        {detailTitle} for the Month of {monthLabel}
      </p>
      <CompanyHeader bill={bill} />
      <p className="border border-black border-t-0 px-2 py-0.5 text-center text-sm font-semibold">
        Customer Details
      </p>
      <CustomerBlock bill={bill} dateLabel={formatBillDate(bill.invoiceDate)} />

      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr>
            {[
              "Invoice Date",
              "Invoice No",
              "Invoice Quantity",
              "Material Code",
              "Material Discription",
              "Plant",
              "Vehicle No.",
              "L.R. No.",
              "Per Part Wt. (Kg.)",
              "Total Wt. (Kg.)",
              "Rate per Kg. (Rs.)",
              "Total Amount",
            ].map((label) => (
              <th key={label} className={`${cell} text-center font-semibold`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bill.lines.length === 0 ? (
            <tr>
              <td className={cell} colSpan={12}>
                No trips found for this month.
              </td>
            </tr>
          ) : (
            bill.lines.map((line, index) => (
              <tr key={`${line.invoiceNo}-${line.materialCode}-${index}`}>
                <td className={cell}>{formatDetailDate(line.invoiceDate)}</td>
                <td className={cell}>{line.invoiceNo}</td>
                <td className={cellRight}>{formatQty(line.invoiceQty)}</td>
                <td className={cell}>{line.materialCode}</td>
                <td className={cell}>{line.materialDescription}</td>
                <td className={cell}>{line.plantCode}</td>
                <td className={cell}>{line.vehicleNo}</td>
                <td className={cell}>{line.lrNo}</td>
                <td className={cellRight}>
                  {line.perPartWt != null && line.perPartWt !== 0
                    ? formatQty(line.perPartWt)
                    : ""}
                </td>
                <td className={cellRight}>{formatQty(line.totalWt)}</td>
                <td className={cellRight}>
                  {line.ratePerKg != null ? line.ratePerKg.toFixed(2) : ""}
                </td>
                <td className={cellRight}>{formatMoney(line.amount)}</td>
              </tr>
            ))
          )}
          {bill.lines.length > 0 && (
            <tr className="font-semibold">
              <td className={cell} colSpan={2}>
                Total
              </td>
              <td className={cellRight}>{formatQty(totalQuantity(bill.lines))}</td>
              <td className={cell} colSpan={6} />
              <td className={cellRight}>{formatQty(totalWeight(bill.lines))}</td>
              <td className={cell} />
              <td className={cellRight}>{formatMoney(bill.totals.subTotal)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export function BillPreview({ bill }: { bill: BillData }) {
  return (
    <div className="bill-print-area">
      <SummaryPage bill={bill} />
      <DetailPage bill={bill} />
    </div>
  );
}
