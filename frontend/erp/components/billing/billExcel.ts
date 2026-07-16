import * as XLSX from "xlsx";
import { formatBillDate, formatMonthLabel, totalQuantity, totalWeight } from "@/lib/billing";
import { findCompany } from "@/lib/billingConfig";
import { lineGrossAmount, lineGstAmount, totalGross, totalNet, totalQtyBrass } from "@/lib/infraBilling";
import type { BillData } from "./BillPreview";
import type { InfraBillData } from "./InfraBillPreview";

/**
 * "Save as Excel" for both bill types — a Summary sheet (mirrors PDF page 1)
 * and a Detail sheet (mirrors page 2), built from the same computed
 * rateGroups/lines/totals the print preview already uses so the two exports
 * never drift apart.
 */

type SheetRow = (string | number)[];

function downloadWorkbook(sheets: { name: string; rows: SheetRow[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function exportCargoBillExcel(bill: BillData) {
  const company = findCompany(bill.companyId);
  const halfGst = bill.gstPercent / 2;

  const summary: SheetRow[] = [
    ["TAX INVOICE"],
    [],
    ["Company", company?.name ?? bill.companyId],
    ["Address", company?.addressLine ?? ""],
    ["GST No", company?.gstNo ?? ""],
    [],
    ["Invoice No", bill.invoiceNo],
    ["Invoice Date", formatBillDate(bill.invoiceDate)],
    ["HSN No", bill.hsnNo],
    ["Billing Month", formatMonthLabel(bill.month)],
    [],
    ["Customer Name", bill.customer.name],
    ["Customer Address", bill.customer.address],
    ["Customer PIN", bill.customer.pin],
    ["Customer GST No", bill.customer.gstNo],
    [],
    ["Description", bill.description],
    [],
    ["Rate (Rs/Kg)", "Qty (Kg)", "Amount (Rs)"],
    ...bill.rateGroups.map((g): SheetRow => [g.rate, g.qty, g.amount]),
    [],
    ["", "Sub Total", bill.totals.subTotal],
    ["", `CGST ${halfGst}%`, bill.totals.cgst],
    ["", `SGST ${halfGst}%`, bill.totals.sgst],
    ["", "Grand Total", bill.totals.grandTotal],
  ];

  const detail: SheetRow[] = [
    [
      "Invoice Date",
      "Invoice No",
      "Invoice Qty",
      "Material Code",
      "Material Description",
      "Plant",
      "Vehicle No",
      "L.R. No.",
      "Per Part Wt (Kg)",
      "Total Wt (Kg)",
      "Rate per Kg (Rs)",
      "Amount (Rs)",
    ],
    ...bill.lines.map(
      (l): SheetRow => [
        l.invoiceDate,
        l.invoiceNo,
        l.invoiceQty,
        l.materialCode,
        l.materialDescription,
        l.plantCode,
        l.vehicleNo,
        l.lrNo,
        l.perPartWt ?? "",
        l.totalWt,
        l.ratePerKg ?? "",
        l.amount,
      ]
    ),
    [],
    [
      "Total",
      "",
      totalQuantity(bill.lines),
      "",
      "",
      "",
      "",
      "",
      "",
      totalWeight(bill.lines),
      "",
      bill.totals.subTotal,
    ],
  ];

  downloadWorkbook(
    [
      { name: "Summary", rows: summary },
      { name: "Detail", rows: detail },
    ],
    `Bill_${bill.invoiceNo || "draft"}_${bill.month || "month"}.xlsx`
  );
}

export function exportInfraBillExcel(bill: InfraBillData) {
  const company = findCompany(bill.companyId);
  const halfGst = bill.gstPercent / 2;
  const projectLabel = [bill.projectCode, bill.projectName].filter(Boolean).join("-");
  const shippingLabel = [bill.shippingName, bill.shippingAddress].filter(Boolean).join(", ");

  const summary: SheetRow[] = [
    ["TAX INVOICE"],
    [],
    ["Company", company?.name ?? bill.companyId],
    ["Address", company?.addressLine ?? ""],
    ["GST No", company?.gstNo ?? ""],
    [],
    ["Invoice No", bill.invoiceNo],
    ["Invoice Date", formatBillDate(bill.invoiceDate)],
    ["HSN/SAC No", bill.hsnNo],
    ["Billing Month", formatMonthLabel(bill.month)],
    [],
    ["Customer Name", bill.clientName],
    ["Customer Address", bill.clientAddress],
    ["Customer GST No", bill.clientGstNo],
    ["Shipping", shippingLabel],
    ["Project Code & Name", projectLabel],
    [],
    ["Sr.No", "Description of Goods", "HSN/SAC", "Quantity (In Brass)", "Rate (Per Brass)", "Amount"],
    ...bill.rateGroups.map(
      (g, i): SheetRow => [i + 1, bill.materialType, bill.hsnNo, g.qty, g.rate, g.amount]
    ),
    [],
    ["", "", "", "", "Total", bill.totals.subTotal],
    ["", "", "", "", `CGST ${halfGst}%`, bill.totals.cgst],
    ["", "", "", "", `SGST ${halfGst}%`, bill.totals.sgst],
    ["", "", "", "", "Total", bill.totals.grandTotal],
  ];

  const detail: SheetRow[] = [
    ["Receipt No", "Vehicle No", "Date", "Material", "Brass", "Rate", "Net", "GST", "Gross"],
    ...bill.lines.map(
      (l): SheetRow => [
        l.receiptNo,
        l.vehicleNo,
        formatBillDate(l.date),
        l.materialType,
        l.qtyBrass,
        l.ratePerBrass ?? "",
        l.netAmount,
        lineGstAmount(l.netAmount, bill.gstPercent),
        lineGrossAmount(l.netAmount, bill.gstPercent),
      ]
    ),
    [],
    [
      "Total",
      "",
      "",
      "",
      totalQtyBrass(bill.lines),
      "",
      totalNet(bill.lines),
      bill.lines.reduce((sum, l) => sum + lineGstAmount(l.netAmount, bill.gstPercent), 0),
      totalGross(bill.lines, bill.gstPercent),
    ],
  ];

  downloadWorkbook(
    [
      { name: "Summary", rows: summary },
      { name: "Detail", rows: detail },
    ],
    `Bill_${bill.invoiceNo || "draft"}_${bill.month || "month"}.xlsx`
  );
}

