"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildRateGroups,
  collectBillLines,
  computeBillTotals,
  formatMoney,
  formatMonthLabel,
  suggestBillDescription,
} from "@/lib/billing";
import {
  BILL_CATEGORIES,
  BLANK_CUSTOMER_DEFAULTS,
  COMPANIES,
  DEFAULT_PLANT_CODE,
  GST_PERCENT_DEFAULT,
  PLANT_CUSTOMER_DEFAULTS,
  findCompany,
  getBillPlants,
} from "@/lib/billingConfig";
import type { CargoSourceType } from "@/lib/sheetConfig";
import {
  deleteBill,
  findExistingBill,
  getAllBills,
  onBillsUpdate,
  saveBill,
  suggestNextInvoiceNo,
  type SavedBill,
} from "@/lib/billingStore";
import { BillPreview, type BillData } from "@/components/billing/BillPreview";
import { FormField } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface BillFormValues {
  companyId: string;
  plantType: CargoSourceType;
  categoryId: string;
  month: string;
  invoiceNo: string;
  invoiceDate: string;
  hsnNo: string;
  gstPercent: string;
  plantCode: string;
  description: string;
  customerName: string;
  customerAddress: string;
  customerPin: string;
  customerGst: string;
}

function defaultValues(): BillFormValues {
  const company = COMPANIES[0];
  const plantType = getBillPlants()[0].type;
  const customer = PLANT_CUSTOMER_DEFAULTS[plantType] ?? BLANK_CUSTOMER_DEFAULTS;
  return {
    companyId: company.id,
    plantType,
    categoryId: BILL_CATEGORIES[0].id,
    month: currentMonth(),
    invoiceNo: suggestNextInvoiceNo(company.id),
    invoiceDate: today(),
    hsnNo: company.defaultHsn,
    gstPercent: String(GST_PERCENT_DEFAULT),
    plantCode: DEFAULT_PLANT_CODE,
    description: "",
    customerName: customer.name,
    customerAddress: customer.address,
    customerPin: customer.pin,
    customerGst: customer.gstNo,
  };
}

/** Re-apply the defaults that depend on the changed field. */
function applyDefaults(values: BillFormValues, changed: keyof BillFormValues): BillFormValues {
  const next = { ...values };
  if (changed === "companyId") {
    const company = findCompany(next.companyId);
    if (company) {
      next.hsnNo = company.defaultHsn;
      next.invoiceNo = suggestNextInvoiceNo(company.id);
    }
  }
  if (changed === "plantType") {
    const customer = PLANT_CUSTOMER_DEFAULTS[next.plantType] ?? BLANK_CUSTOMER_DEFAULTS;
    next.customerName = customer.name;
    next.customerAddress = customer.address;
    next.customerPin = customer.pin;
    next.customerGst = customer.gstNo;
  }
  if (
    changed === "companyId" ||
    changed === "plantType" ||
    changed === "month" ||
    changed === "categoryId"
  ) {
    next.description = suggestBillDescription(
      next.companyId,
      next.plantType,
      next.month,
      next.categoryId
    );
  }
  return next;
}

export function BillingModule() {
  const [values, setValues] = useState<BillFormValues>(() =>
    applyDefaults(defaultValues(), "month")
  );
  const [savedBills, setSavedBills] = useState<SavedBill[]>(() => getAllBills());
  const [viewBill, setViewBill] = useState<SavedBill | null>(null);
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [message, setMessage] = useState("");
  const [recordsVersion, setRecordsVersion] = useState(0);
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const syncRecords = () => setRecordsVersion((v) => v + 1);
    window.addEventListener("sahyadri-local-update", syncRecords);
    window.addEventListener("sahyadri-location-update", syncRecords);
    const offBills = onBillsUpdate(() => setSavedBills(getAllBills()));
    return () => {
      window.removeEventListener("sahyadri-local-update", syncRecords);
      window.removeEventListener("sahyadri-location-update", syncRecords);
      offBills();
    };
  }, []);

  const billPlants = useMemo(() => getBillPlants(), [recordsVersion]);

  const lines = useMemo(
    () =>
      collectBillLines(
        values.companyId,
        values.plantType,
        values.month,
        values.categoryId,
        values.plantCode
      ),
    // recordsVersion re-reads localStorage when trip records change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.companyId, values.plantType, values.month, values.categoryId, values.plantCode, recordsVersion]
  );

  const gstPercent = Number(values.gstPercent) || GST_PERCENT_DEFAULT;
  const rateGroups = useMemo(() => buildRateGroups(lines), [lines]);
  const totals = useMemo(() => computeBillTotals(lines, gstPercent), [lines, gstPercent]);

  const plantLabel =
    billPlants.find((p) => p.type === values.plantType)?.label ?? values.plantType;

  const draft: BillData = {
    companyId: values.companyId,
    invoiceNo: values.invoiceNo,
    invoiceDate: values.invoiceDate,
    month: values.month,
    plantType: values.plantType,
    plantLabel,
    categoryId: values.categoryId,
    hsnNo: values.hsnNo,
    description: values.description,
    customer: {
      name: values.customerName,
      address: values.customerAddress,
      pin: values.customerPin,
      gstNo: values.customerGst,
    },
    gstPercent,
    plantCode: values.plantCode,
    lines,
    rateGroups,
    totals,
  };

  function handleChange(name: string, value: string) {
    setValues((prev) =>
      applyDefaults({ ...prev, [name]: value } as BillFormValues, name as keyof BillFormValues)
    );
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  function handleSave() {
    if (lines.length === 0) {
      setStatus("error");
      setMessage("No trips found for this plant, category and month — nothing to bill.");
      return;
    }
    if (!values.invoiceNo.trim()) {
      setStatus("error");
      setMessage("Enter an invoice number before saving.");
      return;
    }
    const existing = findExistingBill(
      values.companyId,
      values.plantType,
      values.categoryId,
      values.month
    );
    if (existing) {
      setStatus("error");
      setMessage(
        `Bill already saved for this company, plant and category in ${formatMonthLabel(values.month)} (Invoice No ${existing.invoiceNo}). Delete it below to re-generate.`
      );
      return;
    }
    requestConfirm(() => {
      saveBill({
        ...draft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
      notify(`Bill ${values.invoiceNo} saved.`);
      setValues((prev) => ({
        ...prev,
        invoiceNo: suggestNextInvoiceNo(prev.companyId),
      }));
    });
  }

  function handleDelete(bill: SavedBill) {
    if (!window.confirm(`Delete bill ${bill.invoiceNo} (${formatMonthLabel(bill.month)})?`)) {
      return;
    }
    deleteBill(bill.id);
    if (viewBill?.id === bill.id) setViewBill(null);
    notify(`Bill ${bill.invoiceNo} deleted.`);
  }

  // Viewing a saved bill replaces the draft preview so printing captures it alone.
  if (viewBill) {
    return (
      <div className="max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => setViewBill(null)}
            className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/5"
          >
            ← Back to Billing
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Print / Save PDF
          </button>
          <p className="text-sm text-black">
            Saved bill — Invoice {viewBill.invoiceNo}, {formatMonthLabel(viewBill.month)},{" "}
            {findCompany(viewBill.companyId)?.name}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 shadow-sm">
          <BillPreview bill={viewBill} />
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 print:hidden">
        <h2 className="text-xl font-semibold text-black">Billing</h2>
        <p className="mt-1 text-sm text-black">
          Generate monthly tax invoices from saved trips — per company, plant and bill
          category. Freight and separately billed materials (Empty Pallet, KOPA) get their
          own bills.
        </p>
      </div>

      <div className="space-y-5 print:hidden">
        <FormSection
          title="1. Bill Selection"
          description="Company, plant, category and month decide which trips are pulled in."
        >
          <FormField
            field={{
              name: "companyId",
              label: "Billing Company",
              type: "select",
              required: true,
              options: COMPANIES.map((c) => ({ value: c.id, label: c.name })),
            }}
            value={values.companyId}
            onChange={handleChange}
          />
          <FormField
            field={{
              name: "plantType",
              label: "Plant / Source",
              type: "select",
              required: true,
              options: billPlants.map((p) => ({ value: p.type, label: p.label })),
            }}
            value={values.plantType}
            onChange={handleChange}
          />
          <FormField
            field={{
              name: "categoryId",
              label: "Bill Category",
              type: "select",
              required: true,
              options: BILL_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
            }}
            value={values.categoryId}
            onChange={handleChange}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="field-month" className="text-sm font-medium text-black">
              Billing Month <span>*</span>
            </label>
            <input
              id="field-month"
              type="month"
              required
              value={values.month}
              onChange={(e) => handleChange("month", e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </FormSection>

        <FormSection
          title="2. Invoice Details"
          description="Auto-suggested from saved bills and company defaults — adjust as needed."
        >
          <FormField
            field={{
              name: "invoiceNo",
              label: "Invoice No",
              type: "text",
              required: true,
              placeholder: "e.g. 173",
            }}
            value={values.invoiceNo}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "invoiceDate", label: "Invoice Date", type: "date", required: true }}
            value={values.invoiceDate}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "hsnNo", label: "HSN / SAC No", type: "text" }}
            value={values.hsnNo}
            onChange={handleChange}
          />
          <FormField
            field={{
              name: "gstPercent",
              label: "GST % (split CGST/SGST)",
              type: "number",
              step: "0.01",
            }}
            value={values.gstPercent}
            onChange={handleChange}
          />
          <FormField
            field={{
              name: "plantCode",
              label: "Customer Plant Code",
              type: "text",
              placeholder: "e.g. 1113",
            }}
            value={values.plantCode}
            onChange={handleChange}
          />
          <div className="sm:col-span-2">
            <FormField
              field={{
                name: "description",
                label: "Bill Description",
                type: "textarea",
                placeholder: "Material Transportation Charges From … To …",
              }}
              value={values.description}
              onChange={handleChange}
            />
          </div>
        </FormSection>

        <FormSection
          title="3. Customer Details"
          description="Pre-filled from the selected plant — editable."
        >
          <FormField
            field={{ name: "customerName", label: "Customer Name", type: "text", required: true }}
            value={values.customerName}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "customerAddress", label: "Address", type: "text" }}
            value={values.customerAddress}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "customerPin", label: "PIN", type: "text" }}
            value={values.customerPin}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "customerGst", label: "Customer GST No", type: "text" }}
            value={values.customerGst}
            onChange={handleChange}
          />
        </FormSection>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black shadow-sm">
            <span className="font-medium">{lines.length}</span> trip lines ·{" "}
            <span className="font-medium">Rs {formatMoney(totals.grandTotal)}</span> incl. GST
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-black/15 bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/5"
          >
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Save Bill
          </button>
        </div>

        <StatusMessage type={status === "error" ? "error" : "idle"} message={message} />
      </div>

      <div className="mt-6 rounded-lg border border-black/10 shadow-sm">
        <p className="rounded-t-lg border-b border-black/10 bg-page px-3 py-2 text-sm font-semibold text-black print:hidden">
          Bill Preview — {formatMonthLabel(values.month)}
        </p>
        <BillPreview bill={draft} />
      </div>

      <div className="mt-8 print:hidden">
        <h3 className="mb-2 text-base font-semibold text-black">Saved Bills</h3>
        {savedBills.length === 0 ? (
          <p className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black shadow-sm">
            No bills saved yet. Generate a preview above and press Save Bill.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
            <table className="w-full border-collapse text-sm text-black">
              <thead>
                <tr className="bg-page">
                  {["Invoice No", "Company", "Plant", "Category", "Month", "Amount (incl. GST)", ""].map(
                    (label) => (
                      <th key={label} className="border-b border-black/10 px-2 py-2 text-left font-semibold">
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {savedBills.map((bill) => (
                  <tr key={bill.id} className="border-b border-black/10 last:border-b-0 hover:bg-black/5">
                    <td className="px-2 py-2">{bill.invoiceNo}</td>
                    <td className="px-2 py-2">
                      {findCompany(bill.companyId)?.name ?? bill.companyId}
                    </td>
                    <td className="px-2 py-2">{bill.plantLabel}</td>
                    <td className="px-2 py-2">
                      {BILL_CATEGORIES.find((c) => c.id === bill.categoryId)?.label ??
                        bill.categoryId}
                    </td>
                    <td className="px-2 py-2">
                      {formatMonthLabel(bill.month)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {formatMoney(bill.totals.grandTotal)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setViewBill(bill)}
                        className="mr-3 text-brand-text underline"
                      >
                        View / Print
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(bill)}
                        className="text-critical underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        message={`Save bill ${values.invoiceNo} for ${formatMonthLabel(values.month)}?`}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}
