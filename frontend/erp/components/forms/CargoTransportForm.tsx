"use client";

import { useEffect, useMemo, useState } from "react";
import type { FieldConfig, FieldSection, SheetType } from "@/lib/types";
import { submitToSheet } from "@/lib/api";
import {
  CARGO_FIELDS,
  CARGO_SECTIONS,
  CARGO_SOURCES,
  getCargoRouteDefaults,
  emptyValues,
  parseFormData,
} from "@/lib/sheetConfig";
import { calcCargoTransportByWeight } from "@/lib/materialMaster";
import { companyName } from "@/lib/companies";
import { findMaterialByCodeAll } from "@/lib/materialStore";
import { findRecordsByDocumentNo } from "@/lib/localStore";
import { getVehicleNoOptions } from "@/lib/vehicleStore";
import {
  findLatestDieselFillByVehicle,
  listDieselFillsByVehicle,
} from "@/lib/dieselUtils";
import { FormField } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

interface MaterialLineValues {
  id: string;
  materialCode: string;
  materialDescription: string;
  hsnCode: string;
  quantity: string;
  uom: string;
  perPartWt: string;
  totalWt: string;
}

interface InvoiceValues {
  id: string;
  documentNo: string;
  date: string;
  lines: MaterialLineValues[];
}

const TRIP_DETAIL_SECTIONS: FieldSection[] = CARGO_SECTIONS.filter(
  (section) => section.id === "route" || section.id === "transport"
);

const EXPENSE_SECTION = CARGO_SECTIONS.find((section) => section.id === "expenses");
const RECEIPT_SECTION = CARGO_SECTIONS.find((section) => section.id === "receipt");

const MATERIAL_ENTRY_FIELDS: FieldConfig[] = [
  { name: "materialCode", label: "Material Code", type: "text", required: true, placeholder: "e.g. 6001679" },
  { name: "quantity", label: "Qty", type: "number", required: true, step: "0.01" },
  {
    name: "uom",
    label: "Unit",
    type: "select",
    required: true,
    options: ["EA", "KG", "Brass"],
  },
  { name: "hsnCode", label: "HSN (optional)", type: "text", placeholder: "73259910" },
];

function createMaterialLine(): MaterialLineValues {
  return {
    id: crypto.randomUUID(),
    materialCode: "",
    materialDescription: "",
    hsnCode: "",
    quantity: "",
    uom: "EA",
    perPartWt: "",
    totalWt: "",
  };
}

function createInvoice(): InvoiceValues {
  return {
    id: crypto.randomUUID(),
    documentNo: "",
    date: "",
    lines: [createMaterialLine()],
  };
}

function emptySourceValues(
  source: (typeof CARGO_SOURCES)[number]
): Record<string, string> {
  return applySourceRoute(emptyValues(CARGO_FIELDS), source.type);
}

function applySourceRoute(
  values: Record<string, string>,
  sourceType: (typeof CARGO_SOURCES)[number]["type"]
): Record<string, string> {
  const { fromLocation, toOptions } = getCargoRouteDefaults(sourceType);
  const toParty = toOptions.includes(values.toParty) ? values.toParty : "";
  return { ...values, fromLocation, toParty };
}

function applyMaterialDefaultsByCode(
  line: MaterialLineValues,
  materialCode: string
): MaterialLineValues {
  const material = findMaterialByCodeAll(materialCode);
  if (!material) {
    return {
      ...line,
      materialCode,
      materialDescription: "",
      perPartWt: "",
    };
  }

  return {
    ...line,
    materialCode: material.code,
    materialDescription: material.name,
    uom: material.weightPerPieceKg !== undefined ? "EA" : line.uom || "EA",
    perPartWt:
      material.weightPerPieceKg !== undefined ? String(material.weightPerPieceKg) : "",
  };
}

function getLineEffectiveRate(
  line: MaterialLineValues,
  tripCalc: ReturnType<typeof calcCargoTransportByWeight>
) {
  const material = findMaterialByCodeAll(line.materialCode);
  if (material?.ratePerKg != null) {
    return { rate: material.ratePerKg, rateTier: `Material rate — Rs ${material.ratePerKg}/kg` };
  }
  return { rate: tripCalc?.transportRate ?? null, rateTier: tripCalc?.rateTier ?? "" };
}

function recalculateLine(line: MaterialLineValues): MaterialLineValues {
  const qty = Number(line.quantity);
  const perPart = Number(line.perPartWt);

  if (line.uom === "KG" && qty) {
    return { ...line, totalWt: String(qty) };
  }
  if (line.uom === "EA" && qty && perPart) {
    return { ...line, totalWt: String(Math.round(qty * perPart * 1000) / 1000) };
  }
  if (line.uom === "Brass" && qty) {
    return { ...line, totalWt: "" };
  }
  return { ...line, totalWt: "" };
}

function recalculateLineWeights(invoices: InvoiceValues[]): InvoiceValues[] {
  return invoices.map((invoice) => ({
    ...invoice,
    lines: invoice.lines.map(recalculateLine),
  }));
}

function getTotalTripWeight(invoices: InvoiceValues[]): number {
  return invoices.reduce(
    (sum, invoice) =>
      sum + invoice.lines.reduce((lineSum, line) => lineSum + Number(line.totalWt || 0), 0),
    0
  );
}

function buildCargoPayloads(
  values: Record<string, string>,
  invoices: InvoiceValues[]
): Record<string, string | number>[] {
  const weighted = recalculateLineWeights(invoices);
  const totalTripWeight = getTotalTripWeight(weighted);
  const tripCalc = calcCargoTransportByWeight(totalTripWeight);

  return weighted.flatMap((invoice) =>
    invoice.lines.map((line) => {
      const lineWeight = Number(line.totalWt || 0);
      const { rate, rateTier } = getLineEffectiveRate(line, tripCalc);
      const transportRate = rate ?? "";
      const transportAmount =
        rate != null && lineWeight
          ? Math.round(lineWeight * rate * 100) / 100
          : "";

      return parseFormData({
        ...values,
        documentNo: invoice.documentNo,
        date: invoice.date,
        materialCode: line.materialCode,
        materialDescription: line.materialDescription,
        hsnCode: line.hsnCode,
        quantity: line.quantity,
        uom: line.uom,
        perPartWt: line.perPartWt,
        totalWt: line.totalWt,
        transportRate: transportRate === "" ? "" : String(transportRate),
        transportAmount: transportAmount === "" ? "" : String(transportAmount),
        rateTier,
      });
    })
  );
}

function findDuplicateDocumentNo(
  invoices: InvoiceValues[]
): { documentNo: string; source: string } | null {
  const seenInThisSubmission = new Map<string, string>();

  for (const invoice of invoices) {
    const raw = invoice.documentNo.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();

    if (seenInThisSubmission.has(key)) {
      return { documentNo: raw, source: "entered twice in this submission" };
    }
    seenInThisSubmission.set(key, raw);

    const existing = findRecordsByDocumentNo(raw);
    if (existing.length > 0) {
      const sourceLabel =
        CARGO_SOURCES.find((s) => s.type === existing[0].type)?.label ??
        existing[0].type;
      return { documentNo: raw, source: sourceLabel };
    }
  }

  return null;
}

function suggestDieselFillRef(
  values: Record<string, string>,
  changedField: string
): Record<string, string> {
  if (changedField !== "vehicleNo") return values;

  const vehicle = values.vehicleNo.trim();
  if (!vehicle) {
    return { ...values, dieselFillRef: "" };
  }

  const matchedFill = findLatestDieselFillByVehicle(vehicle);
  return { ...values, dieselFillRef: matchedFill?.fillRef ?? "" };
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex gap-2 text-xs text-black">
      <span className="w-32 shrink-0 font-medium">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function resolveFieldConfig(
  field: FieldConfig,
  sourceType: (typeof CARGO_SOURCES)[number]["type"]
): FieldConfig {
  if (field.name === "toParty") {
    return {
      ...field,
      options: getCargoRouteDefaults(sourceType).toOptions,
    };
  }
  return field;
}

export function CargoTransportForm() {
  const [activeSource, setActiveSource] = useState<(typeof CARGO_SOURCES)[number]>(
    CARGO_SOURCES[0]
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    emptySourceValues(CARGO_SOURCES[0])
  );
  const [invoices, setInvoices] = useState<InvoiceValues[]>([createInvoice()]);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [vehicleNoOptions, setVehicleNoOptions] = useState(() => getVehicleNoOptions());
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const sync = () => setVehicleNoOptions(getVehicleNoOptions());
    window.addEventListener("sahyadri-vehicle-update", sync);
    return () => window.removeEventListener("sahyadri-vehicle-update", sync);
  }, []);

  const tripSections = useMemo(
    () =>
      TRIP_DETAIL_SECTIONS.map((section) => ({
        ...section,
        fields: section.fields.map((f) => {
          const resolved = resolveFieldConfig(f, activeSource.type);
          if (f.name === "vehicleNo" && vehicleNoOptions.length > 0) {
            return { ...resolved, type: "select" as const, options: vehicleNoOptions };
          }
          return resolved;
        }),
      })),
    [activeSource.type, vehicleNoOptions]
  );

  const tripFields = useMemo(() => tripSections.flatMap((s) => s.fields), [tripSections]);

  const vehicleDieselFills = useMemo(
    () => listDieselFillsByVehicle(values.vehicleNo),
    [values.vehicleNo]
  );

  const weightedInvoices = useMemo(() => recalculateLineWeights(invoices), [invoices]);

  const totalTripWeight = useMemo(
    () => getTotalTripWeight(weightedInvoices),
    [weightedInvoices]
  );

  const tripRate = useMemo(() => calcCargoTransportByWeight(totalTripWeight), [totalTripWeight]);

  const totalTransportAmount = useMemo(() =>
    weightedInvoices.reduce((sum, invoice) =>
      sum + invoice.lines.reduce((lineSum, line) => {
        const lineWeight = Number(line.totalWt || 0);
        const { rate } = getLineEffectiveRate(line, tripRate);
        return lineSum + (rate != null && lineWeight ? Math.round(lineWeight * rate * 100) / 100 : 0);
      }, 0),
    0),
    [weightedInvoices, tripRate]
  );

  const summaryRateDisplay = useMemo(() => {
    const rates = new Set<number>();
    for (const inv of weightedInvoices) {
      for (const line of inv.lines) {
        if (!Number(line.totalWt || 0)) continue;
        const matRate = findMaterialByCodeAll(line.materialCode)?.ratePerKg;
        const r = matRate ?? tripRate?.transportRate;
        if (r != null) rates.add(r);
      }
    }
    if (rates.size === 0) return null;
    if (rates.size === 1) {
      const rate = Array.from(rates)[0];
      const allMaterial = !weightedInvoices.some((inv) =>
        inv.lines.some(
          (line) =>
            Number(line.totalWt || 0) > 0 &&
            findMaterialByCodeAll(line.materialCode)?.ratePerKg == null
        )
      );
      return {
        rate: `Rs ${rate}/kg`,
        tier: allMaterial ? "Material rate" : (tripRate?.rateTier ?? ""),
      };
    }
    return {
      rate: "Mixed rates",
      tier: totalTripWeight > 0
        ? `Rs ${Math.round((totalTransportAmount / totalTripWeight) * 100) / 100}/kg effective avg`
        : "",
    };
  }, [weightedInvoices, tripRate, totalTransportAmount, totalTripWeight]);

  function resetStatus() {
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  function handleChange(name: string, value: string) {
    setValues((prev) => suggestDieselFillRef({ ...prev, [name]: value }, name));
    resetStatus();
  }

  function handleInvoiceChange(invoiceId: string, name: "documentNo" | "date", value: string) {
    setInvoices((prev) =>
      prev.map((invoice) => (invoice.id === invoiceId ? { ...invoice, [name]: value } : invoice))
    );
    resetStatus();
  }

  function handleMaterialLineChange(
    invoiceId: string,
    lineId: string,
    name: keyof MaterialLineValues,
    value: string
  ) {
    setInvoices((prev) =>
      recalculateLineWeights(
        prev.map((invoice) => {
          if (invoice.id !== invoiceId) return invoice;
          return {
            ...invoice,
            lines: invoice.lines.map((line) => {
              if (line.id !== lineId) return line;
              const updated = { ...line, [name]: value };
              return name === "materialCode"
                ? applyMaterialDefaultsByCode(updated, value)
                : updated;
            }),
          };
        })
      )
    );
    resetStatus();
  }

  function addInvoice() {
    setInvoices((prev) => [...prev, createInvoice()]);
  }

  function removeInvoice(invoiceId: string) {
    setInvoices((prev) => (prev.length === 1 ? prev : prev.filter((i) => i.id !== invoiceId)));
    resetStatus();
  }

  function addMaterialLine(invoiceId: string) {
    setInvoices((prev) =>
      prev.map((invoice) =>
        invoice.id === invoiceId
          ? { ...invoice, lines: [...invoice.lines, createMaterialLine()] }
          : invoice
      )
    );
    resetStatus();
  }

  function removeMaterialLine(invoiceId: string, lineId: string) {
    setInvoices((prev) =>
      recalculateLineWeights(
        prev.map((invoice) => {
          if (invoice.id !== invoiceId) return invoice;
          return invoice.lines.length === 1
            ? invoice
            : { ...invoice, lines: invoice.lines.filter((line) => line.id !== lineId) };
        })
      )
    );
    resetStatus();
  }

  function switchSource(source: (typeof CARGO_SOURCES)[number]) {
    setActiveSource(source);
    setValues(emptySourceValues(source));
    setInvoices([createInvoice()]);
    setStatus("idle");
    setMessage("");
  }

  async function performSave() {
    setSubmitting(true);

    const records = buildCargoPayloads(values, invoices);

    try {
      const result = await submitToSheet({
        type: activeSource.type as SheetType,
        records,
      });

      if (result.success) {
        notify(result.message);
        setValues(emptySourceValues(activeSource));
        setInvoices([createInvoice()]);
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and Web App URL.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDiscard() {
    setValues(emptySourceValues(activeSource));
    setInvoices([createInvoice()]);
    cancel();
    notify("Entry deleted — form cleared.", "error");
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("idle");
    setMessage("");

    const duplicate = findDuplicateDocumentNo(invoices);
    if (duplicate) {
      setStatus("error");
      setMessage(
        `Invoice / DC No "${duplicate.documentNo}" already exists (${duplicate.source}). Invoice/DC numbers cannot repeat.`
      );
      return;
    }

    requestConfirm(performSave);
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-black">Cargo Transport</h2>

        <div className="mt-3 flex overflow-x-auto border border-black sm:flex-wrap">
          {CARGO_SOURCES.map((source) => (
            <button
              key={source.type}
              type="button"
              onClick={() => switchSource(source)}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm text-black ${
                activeSource.type === source.type ? "font-semibold underline" : "font-normal"
              }`}
            >
              {source.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-black">
          Saving to sheet: <span className="font-semibold">{activeSource.label}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormSection
          title="1. Trip Details"
          description="Route and vehicle for this trip."
          columns={3}
        >
          {tripFields.map((field) => (
            <div
              key={field.name}
              className={field.colSpan === 2 ? "sm:col-span-2" : undefined}
            >
              <FormField field={field} value={values[field.name]} onChange={handleChange} />
            </div>
          ))}
        </FormSection>

        <FormSection
          title="2. Invoices & Materials"
          description="Add one or more invoices. Enter material code and qty — name and weight auto-fill."
        >
          <div className="space-y-2.5 sm:col-span-2">
            {invoices.map((invoice, invoiceIndex) => (
              <div key={invoice.id} className="border border-black bg-white p-2.5 sm:p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-black">
                    Invoice {invoiceIndex + 1}
                  </h4>
                  {invoices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInvoice(invoice.id)}
                      className="text-xs text-black underline"
                    >
                      Remove invoice
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    field={{
                      name: "documentNo",
                      label: "Invoice / DC No",
                      type: "text",
                      required: true,
                      placeholder: "e.g. 5900089218",
                    }}
                    value={invoice.documentNo}
                    onChange={(_, value) => handleInvoiceChange(invoice.id, "documentNo", value)}
                  />
                  <FormField
                    field={{ name: "date", label: "Date", type: "date", required: true }}
                    value={invoice.date}
                    onChange={(_, value) => handleInvoiceChange(invoice.id, "date", value)}
                  />
                </div>

                <div className="mt-2.5 space-y-2">
                  {invoice.lines.map((line, lineIndex) => (
                    <div key={line.id} className="border border-black/40 p-2 sm:p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-black">
                          Item {lineIndex + 1}
                        </span>
                        {invoice.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMaterialLine(invoice.id, line.id)}
                            className="text-xs text-black underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {MATERIAL_ENTRY_FIELDS.map((field) => (
                          <div
                            key={`${line.id}-${field.name}`}
                            className={
                              field.name === "materialCode" ? "col-span-2" : undefined
                            }
                          >
                            <FormField
                              field={field}
                              value={line[field.name as keyof MaterialLineValues] ?? ""}
                              onChange={(_, value) =>
                                handleMaterialLineChange(
                                  invoice.id,
                                  line.id,
                                  field.name as keyof MaterialLineValues,
                                  value
                                )
                              }
                            />
                          </div>
                        ))}
                      </div>

                      {(line.materialDescription || line.totalWt) && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black">
                          {line.materialDescription && (
                            <span>
                              <span className="font-medium">Name:</span> {line.materialDescription}
                            </span>
                          )}
                          {line.perPartWt && (
                            <span>
                              <span className="font-medium">Per piece:</span> {line.perPartWt} kg
                            </span>
                          )}
                          {line.totalWt && (
                            <span>
                              <span className="font-medium">Line wt:</span> {line.totalWt} kg
                            </span>
                          )}
                          {(() => {
                            const matRate = findMaterialByCodeAll(line.materialCode)?.ratePerKg;
                            return matRate != null ? (
                              <span className="font-medium">
                                Rate: Rs {matRate}/kg
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addMaterialLine(invoice.id)}
                  className="mt-2 text-xs text-black underline sm:text-sm"
                >
                  + Add material to this invoice
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addInvoice}
              className="text-sm text-black underline"
            >
              + Add another invoice
            </button>
          </div>
        </FormSection>

        {summaryRateDisplay && (
          <FormSection
            title="3. Transport Summary"
            description="Calculated from total weight of all materials in this trip."
          >
            <div className="sm:col-span-2 grid grid-cols-3 gap-2">
              <div className="border border-black px-2 py-1.5 text-sm text-black">
                <p className="text-xs font-medium">Total Weight</p>
                <p className="text-sm sm:text-base">
                  {Math.round(totalTripWeight * 1000) / 1000} kg
                </p>
              </div>
              <div className="border border-black px-2 py-1.5 text-sm text-black">
                <p className="text-xs font-medium">Rate</p>
                <p className="text-sm sm:text-base">{summaryRateDisplay.rate}</p>
                <p className="text-xs">{summaryRateDisplay.tier}</p>
              </div>
              <div className="border border-black px-2 py-1.5 text-sm text-black">
                <p className="text-xs font-medium">Transport Amount</p>
                <p className="text-sm font-semibold sm:text-base">
                  Rs {Math.round(totalTransportAmount * 100) / 100}
                </p>
              </div>
            </div>
          </FormSection>
        )}

        {EXPENSE_SECTION && (
          <FormSection
            title="4. Trip Expenses"
            description="Diesel and toll — fill after cargo details."
          >
            {EXPENSE_SECTION.fields.map((field) => (
              <div
                key={field.name}
                className={
                  field.colSpan === 2 || field.name === "dieselFillRef"
                    ? "sm:col-span-2"
                    : undefined
                }
              >
                {field.name === "dieselFillRef" ? (
                  <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                    <FormField
                      field={field}
                      value={values[field.name]}
                      onChange={handleChange}
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor="recent-diesel-fills"
                        className="text-xs font-medium text-black"
                      >
                        Recent fills
                      </label>
                      <select
                        id="recent-diesel-fills"
                        value={values.dieselFillRef || ""}
                        onChange={(e) => handleChange("dieselFillRef", e.target.value)}
                        disabled={!values.vehicleNo.trim() || vehicleDieselFills.length === 0}
                        className="w-full border border-black bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">
                          {values.vehicleNo.trim()
                            ? vehicleDieselFills.length > 0
                              ? "Select fill ref..."
                              : "No fills for vehicle"
                            : "Enter vehicle first"}
                        </option>
                        {vehicleDieselFills.map((fill) => (
                          <option key={fill.fillRef} value={fill.fillRef}>
                            {fill.fillRef}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <FormField field={field} value={values[field.name]} onChange={handleChange} />
                )}
              </div>
            ))}
          </FormSection>
        )}

        {RECEIPT_SECTION && (
          <FormSection title="Receipt (Optional)" description={RECEIPT_SECTION.description}>
            {RECEIPT_SECTION.fields.map((field) => (
              <FormField
                key={field.name}
                field={field}
                value={values[field.name]}
                onChange={handleChange}
              />
            ))}
          </FormSection>
        )}

        <StatusMessage type={status} message={message} />

        <button
          type="submit"
          disabled={submitting}
          className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : `Save to ${activeSource.label}`}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Trip Entry"
        message={`Check the entry below, then save to ${activeSource.label}.`}
        confirmLabel="Confirm & Save"
        cancelLabel="Edit"
        deleteLabel="Delete Entry"
        onConfirm={confirmSave}
        onCancel={cancel}
        onDelete={handleDiscard}
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-black">Trip Details</p>
            <ReviewRow label="Billing Company" value={companyName(values.billingCompany)} />
            <ReviewRow label="From" value={values.fromLocation} />
            <ReviewRow label="To" value={values.toParty} />
            <ReviewRow label="Vehicle No." value={values.vehicleNo} />
            <ReviewRow label="L.R. No." value={values.lrNo} />
          </div>

          {weightedInvoices.map((invoice, index) => (
            <div key={invoice.id}>
              <p className="mb-1 text-xs font-semibold text-black">
                Invoice {index + 1} — {invoice.documentNo || "(no number)"}
                {invoice.date ? `, ${invoice.date}` : ""}
              </p>
              <table className="w-full border-collapse text-xs text-black">
                <thead>
                  <tr>
                    <th className="border border-black px-1.5 py-0.5 text-left">Material</th>
                    <th className="border border-black px-1.5 py-0.5 text-right">Qty</th>
                    <th className="border border-black px-1.5 py-0.5 text-right">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="border border-black px-1.5 py-0.5">
                        {line.materialCode}
                        {line.materialDescription ? ` — ${line.materialDescription}` : ""}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-right">
                        {line.quantity} {line.uom}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-right">
                        {line.totalWt || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div>
            <p className="mb-1 text-xs font-semibold text-black">Transport</p>
            <ReviewRow
              label="Total Weight"
              value={`${Math.round(totalTripWeight * 1000) / 1000} kg`}
            />
            {summaryRateDisplay && (
              <ReviewRow
                label="Rate"
                value={`${summaryRateDisplay.rate}${summaryRateDisplay.tier ? ` (${summaryRateDisplay.tier})` : ""}`}
              />
            )}
            <ReviewRow
              label="Amount"
              value={`Rs ${Math.round(totalTransportAmount * 100) / 100}`}
            />
          </div>

          {(values.dieselFillRef || values.dieselUsedThisTrip || values.tollOverloadAmount) && (
            <div>
              <p className="mb-1 text-xs font-semibold text-black">Expenses</p>
              <ReviewRow label="Diesel Fill Ref" value={values.dieselFillRef} />
              <ReviewRow label="Diesel Used (Rs)" value={values.dieselUsedThisTrip} />
              <ReviewRow label="Toll + Overload (Rs)" value={values.tollOverloadAmount} />
            </div>
          )}

          {(values.receivedQty || values.receivedDate) && (
            <div>
              <p className="mb-1 text-xs font-semibold text-black">Receipt</p>
              <ReviewRow label="Received Qty" value={values.receivedQty} />
              <ReviewRow label="Received Date" value={values.receivedDate} />
            </div>
          )}
        </div>
      </ConfirmDialog>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
