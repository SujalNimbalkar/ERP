"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildInfraRateGroups,
  collectInfraBillLines,
  getInfraMaterialTypes,
  type InfraBillLineItem,
} from "@/lib/infraBilling";
import { computeBillTotals, formatMoney, formatMonthLabel } from "@/lib/billing";
import {
  COMPANIES,
  INFRA_GST_PERCENT_DEFAULT,
  findCompany,
  suggestHsnForMaterial,
} from "@/lib/infraBillingConfig";
import { findClientById, getClientOptions } from "@/lib/clientStore";
import {
  deleteInfraBill,
  findExistingInfraBill,
  getAllInfraBills,
  onInfraBillsUpdate,
  saveInfraBill,
  suggestNextInfraInvoiceNo,
  type SavedInfraBill,
} from "@/lib/billingStore";
import { InfraBillPreview, type InfraBillData } from "@/components/billing/InfraBillPreview";
import { exportInfraBillExcel } from "@/components/billing/billExcel";
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

interface InfraBillFormValues {
  companyId: string;
  clientRef: string;
  materialType: string;
  month: string;
  invoiceNo: string;
  invoiceDate: string;
  hsnNo: string;
  gstPercent: string;
  clientName: string;
  clientAddress: string;
  clientGstNo: string;
  shippingName: string;
  shippingAddress: string;
  projectCode: string;
  projectName: string;
}

function defaultCompany() {
  return COMPANIES.find((c) => c.id === "sahyadri-infra") ?? COMPANIES[0];
}

function defaultValues(): InfraBillFormValues {
  const company = defaultCompany();
  return {
    companyId: company.id,
    clientRef: "",
    materialType: "",
    month: currentMonth(),
    invoiceNo: suggestNextInfraInvoiceNo(company.id),
    invoiceDate: today(),
    hsnNo: "",
    gstPercent: String(INFRA_GST_PERCENT_DEFAULT),
    clientName: "",
    clientAddress: "",
    clientGstNo: "",
    shippingName: "",
    shippingAddress: "",
    projectCode: "",
    projectName: "",
  };
}

/** Re-applies the defaults that depend on the changed field — company changes
 * the invoice-number suggestion, client changes the whole customer/shipping/
 * project block plus resets material type, and either resets the HSN
 * suggestion. */
function applyDefaults(
  values: InfraBillFormValues,
  changed: keyof InfraBillFormValues
): InfraBillFormValues {
  const next = { ...values };
  if (changed === "companyId") {
    next.invoiceNo = suggestNextInfraInvoiceNo(next.companyId);
  }
  if (changed === "clientRef") {
    const client = next.clientRef ? findClientById(next.clientRef) : undefined;
    next.clientName = client?.name ?? "";
    next.clientAddress = client?.address ?? "";
    next.clientGstNo = client?.gstNo ?? "";
    next.shippingName = client?.shippingName ?? "";
    next.shippingAddress = client?.shippingAddress ?? "";
    next.projectCode = client?.projectCode ?? "";
    next.projectName = client?.projectName ?? "";
    const types = getInfraMaterialTypes(next.clientRef, next.clientName);
    next.materialType = types[0] ?? "";
  }
  if (changed === "clientRef" || changed === "materialType") {
    next.hsnNo = suggestHsnForMaterial(next.materialType);
  }
  return next;
}

export function InfraBillingModule() {
  const [values, setValues] = useState<InfraBillFormValues>(() => defaultValues());
  const [savedBills, setSavedBills] = useState<SavedInfraBill[]>(() => getAllInfraBills());
  const [viewBill, setViewBill] = useState<SavedInfraBill | null>(null);
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [message, setMessage] = useState("");
  const [recordsVersion, setRecordsVersion] = useState(0);
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const syncRecords = () => setRecordsVersion((v) => v + 1);
    window.addEventListener("sahyadri-local-update", syncRecords);
    window.addEventListener("sahyadri-client-update", syncRecords);
    const offBills = onInfraBillsUpdate(() => setSavedBills(getAllInfraBills()));
    return () => {
      window.removeEventListener("sahyadri-local-update", syncRecords);
      window.removeEventListener("sahyadri-client-update", syncRecords);
      offBills();
    };
  }, []);

  const clientOptions = useMemo(() => getClientOptions(), [recordsVersion]);

  const materialTypes = useMemo(
    () => getInfraMaterialTypes(values.clientRef, values.clientName),
    // recordsVersion re-reads localStorage when trip records change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.clientRef, values.clientName, recordsVersion]
  );

  const lines: InfraBillLineItem[] = useMemo(
    () =>
      collectInfraBillLines(values.clientRef, values.clientName, values.materialType, values.month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.clientRef, values.clientName, values.materialType, values.month, recordsVersion]
  );

  const gstPercent = Number(values.gstPercent) || INFRA_GST_PERCENT_DEFAULT;
  const rateGroups = useMemo(() => buildInfraRateGroups(lines), [lines]);
  const totals = useMemo(
    () => computeBillTotals(lines.map((l) => ({ amount: l.netAmount })), gstPercent),
    [lines, gstPercent]
  );

  const draft: InfraBillData = {
    moduleType: "infra",
    companyId: values.companyId,
    invoiceNo: values.invoiceNo,
    invoiceDate: values.invoiceDate,
    month: values.month,
    clientRef: values.clientRef,
    clientName: values.clientName,
    clientAddress: values.clientAddress,
    clientGstNo: values.clientGstNo,
    shippingName: values.shippingName,
    shippingAddress: values.shippingAddress,
    projectCode: values.projectCode,
    projectName: values.projectName,
    materialType: values.materialType,
    hsnNo: values.hsnNo,
    gstPercent,
    lines,
    rateGroups,
    totals,
  };

  function handleChange(name: string, value: string) {
    setValues((prev) =>
      applyDefaults({ ...prev, [name]: value } as InfraBillFormValues, name as keyof InfraBillFormValues)
    );
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  function handleSave() {
    if (!values.clientRef) {
      setStatus("error");
      setMessage("Select a Client / Project before generating a bill.");
      return;
    }
    if (!values.materialType) {
      setStatus("error");
      setMessage("Select a material type before generating a bill.");
      return;
    }
    if (lines.length === 0) {
      setStatus("error");
      setMessage("No trips found for this client, material and month — nothing to bill.");
      return;
    }
    if (!values.invoiceNo.trim()) {
      setStatus("error");
      setMessage("Enter an invoice number before saving.");
      return;
    }
    const existing = findExistingInfraBill(
      values.companyId,
      values.clientRef,
      values.materialType,
      values.month
    );
    if (existing) {
      setStatus("error");
      setMessage(
        `Bill already saved for this client and material in ${formatMonthLabel(values.month)} (Invoice No ${existing.invoiceNo}). Delete it below to re-generate.`
      );
      return;
    }
    requestConfirm(() => {
      saveInfraBill({
        ...draft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
      notify(`Bill ${values.invoiceNo} saved.`);
      setValues((prev) => ({
        ...prev,
        invoiceNo: suggestNextInfraInvoiceNo(prev.companyId),
      }));
    });
  }

  function handleDelete(bill: SavedInfraBill) {
    if (!window.confirm(`Delete bill ${bill.invoiceNo} (${formatMonthLabel(bill.month)})?`)) {
      return;
    }
    deleteInfraBill(bill.id);
    if (viewBill?.id === bill.id) setViewBill(null);
    notify(`Bill ${bill.invoiceNo} deleted.`);
  }

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
          <button
            type="button"
            onClick={() => exportInfraBillExcel(viewBill)}
            className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/5"
          >
            Save as Excel
          </button>
          <p className="text-sm text-black">
            Saved bill — Invoice {viewBill.invoiceNo}, {formatMonthLabel(viewBill.month)},{" "}
            {viewBill.clientName}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 shadow-sm">
          <InfraBillPreview bill={viewBill} />
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 print:hidden">
        <h2 className="text-xl font-semibold text-black">Infra & Crusher Billing</h2>
        <p className="mt-1 text-sm text-black">
          Generate monthly tax invoices from saved Infra & Crusher trips — per client / project
          and material type (Csand, Psand, Khadi, Dabar, …). Each material gets its own bill.
        </p>
      </div>

      <div className="space-y-5 print:hidden">
        <FormSection
          title="1. Bill Selection"
          description="Client / Project and material type decide which trips are pulled in."
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
              name: "clientRef",
              label: "Client / Project",
              type: "select",
              required: true,
              options: clientOptions,
            }}
            value={values.clientRef}
            onChange={handleChange}
          />
          <div className="flex flex-col gap-0.5">
            <FormField
              field={{
                name: "materialType",
                label: "Material Type",
                type: "select",
                required: true,
                options: materialTypes,
              }}
              value={values.materialType}
              onChange={handleChange}
            />
            {values.clientRef && materialTypes.length === 0 && (
              <p className="text-xs text-critical">No trips saved for this client yet.</p>
            )}
            {!values.clientRef && (
              <p className="text-xs text-black/60">Pick a Client / Project first.</p>
            )}
          </div>
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
          description="Auto-suggested from saved bills and the selected material — adjust as needed."
        >
          <FormField
            field={{
              name: "invoiceNo",
              label: "Invoice No",
              type: "text",
              required: true,
              placeholder: "e.g. 377",
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
            field={{ name: "hsnNo", label: "HSN / SAC No", type: "text", placeholder: "e.g. 251710" }}
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
        </FormSection>

        <FormSection
          title="3. Customer Details"
          description="Pre-filled from the selected client — editable."
        >
          <FormField
            field={{ name: "clientName", label: "Client Name", type: "text", required: true }}
            value={values.clientName}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "clientAddress", label: "Address", type: "textarea" }}
            value={values.clientAddress}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "clientGstNo", label: "Client GST No", type: "text" }}
            value={values.clientGstNo}
            onChange={handleChange}
          />
        </FormSection>

        <FormSection
          title="4. Shipping Details"
          description="Delivery site — pre-filled from the selected client, editable."
        >
          <FormField
            field={{ name: "shippingName", label: "Shipping Name", type: "text" }}
            value={values.shippingName}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "shippingAddress", label: "Shipping Address", type: "textarea" }}
            value={values.shippingAddress}
            onChange={handleChange}
          />
        </FormSection>

        <FormSection title="5. Project" description="Pre-filled from the selected client, editable.">
          <FormField
            field={{ name: "projectCode", label: "Project Code", type: "text", placeholder: "e.g. HCPL/004" }}
            value={values.projectCode}
            onChange={handleChange}
          />
          <FormField
            field={{ name: "projectName", label: "Project Name", type: "text" }}
            value={values.projectName}
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
            onClick={() => exportInfraBillExcel(draft)}
            className="rounded-md border border-black/15 bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/5"
          >
            Save as Excel
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
        <InfraBillPreview bill={draft} />
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
                  {["Invoice No", "Company", "Client", "Material", "Month", "Amount (incl. GST)", ""].map(
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
                    <td className="px-2 py-2">{bill.clientName}</td>
                    <td className="px-2 py-2">{bill.materialType}</td>
                    <td className="px-2 py-2">{formatMonthLabel(bill.month)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(bill.totals.grandTotal)}</td>
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
