"use client";

import { useEffect, useMemo, useState } from "react";
import type { FieldConfig, FieldSection } from "@/lib/types";
import { submitToSheet, uploadReceiptImage } from "@/lib/api";
import {
  CargoTripReceipt,
  captureCargoReceipt,
  type CargoReceiptData,
} from "@/components/forms/CargoTripReceipt";
import {
  CARGO_FIELDS,
  CARGO_SECTIONS,
  DIESEL_RATE_PER_LITER,
  DIESEL_SUBFORM_FIELDS,
  TRIP_EXPENSE_AMOUNT_FIELDS,
  buildTripExpenseRef,
  getAllCargoSources,
  getCargoRouteDefaults,
  emptyValues,
  parseFormData,
  type CargoSource,
} from "@/lib/sheetConfig";
import { calcCargoTransportByWeight } from "@/lib/materialMaster";
import { companyName } from "@/lib/companies";
import { findMaterialByCodeAll } from "@/lib/materialStore";
import { findRecordsByDocumentNo } from "@/lib/localStore";
import { findDriverById, getDriverOptions } from "@/lib/driverStore";
import {
  MAINTENANCE_SUBFORM_SECTIONS,
  getAllVehicles,
  getNextMaintenanceId,
  getVehicleNoOptions,
  saveMaintenance,
  type VehicleMaintenanceRecord,
} from "@/lib/vehicleStore";
import {
  applyDieselCalc,
  buildDieselFillRef,
  fetchAllDieselFills,
  filterDieselFillsByVehicle,
  latestDieselFillForVehicle,
  type LastDieselFill,
} from "@/lib/dieselUtils";
import { FormField } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { ColoredCheckboxField } from "@/components/ui/ColoredCheckboxField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

/** Filled in the Diesel category color (blue) — matches the Dashboard's
 * Diesel column and the "Diesel filled?" checkbox above. */
const DIESEL_BUTTON_CLASS =
  "rounded-md bg-diesel px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50";

function emptyDieselSubValues(): Record<string, string> {
  return { ...emptyValues(DIESEL_SUBFORM_FIELDS), ratePerLiter: String(DIESEL_RATE_PER_LITER) };
}

function emptyMaintenanceSubValues(): Record<string, string> {
  return emptyValues(MAINTENANCE_SUBFORM_SECTIONS.flatMap((s) => s.fields));
}

function emptyTripExpenseSubValues(): Record<string, string> {
  return emptyValues(TRIP_EXPENSE_AMOUNT_FIELDS);
}

interface MaterialLineValues {
  id: string;
  materialCode: string;
  materialDescription: string;
  hsnCode: string;
  quantity: string;
  uom: string;
  perPartWt: string;
  totalWt: string;
  /** True once the user has typed directly into Line Wt — stops qty/uom from recalculating it. */
  totalWtManual: boolean;
  /** Rate the user can override — defaults to the material's fixed rate or the trip-weight tier. */
  rate: string;
  /** True once the user has typed directly into Rate — stops it following the auto-computed default. */
  rateManual: boolean;
  /** Receiving-stamp quantity for THIS line — optional */
  receivedQty: string;
}

interface InvoiceValues {
  id: string;
  documentNo: string;
  date: string;
  /** Receiving-stamp date for THIS invoice — optional */
  receivedDate: string;
  /** Origin plant for THIS invoice — defaults to the active tab, but a trip
   * can mix invoices from different plants (e.g. H19 and J14 both to Machine Shop). */
  fromType: string;
  /** Destination for THIS invoice — options depend on this invoice's own fromType. */
  toParty: string;
  lines: MaterialLineValues[];
}

/** Trip-level fields only — From/To moved to each invoice (see InvoiceValues). */
const TRIP_DETAIL_SECTIONS: FieldSection[] = CARGO_SECTIONS.filter(
  (section) => section.id === "route" || section.id === "transport"
).map((section) =>
  section.id === "route"
    ? {
        ...section,
        fields: section.fields.filter(
          (f) => f.name !== "fromLocation" && f.name !== "toParty"
        ),
      }
    : section
);

const EXPENSE_SECTION = CARGO_SECTIONS.find((section) => section.id === "expenses");

const MATERIAL_ENTRY_FIELDS: FieldConfig[] = [
  { name: "materialCode", label: "Material Code", type: "text", required: true, placeholder: "e.g. 6001679" },
  { name: "materialDescription", label: "Name", type: "text", placeholder: "Auto-fills — editable" },
  { name: "quantity", label: "Qty", type: "number", required: true, step: "0.01" },
  {
    name: "uom",
    label: "Unit",
    type: "select",
    required: true,
    options: ["EA", "KG", "Brass"],
  },
  { name: "totalWt", label: "Line Wt (kg)", type: "number", step: "0.001", placeholder: "Auto-calculated — editable" },
  { name: "rate", label: "Rate (Rs/kg)", type: "number", step: "0.01", placeholder: "Auto-filled — editable" },
  { name: "hsnCode", label: "HSN (optional)", type: "text", placeholder: "73259910" },
  { name: "receivedQty", label: "Recd Qty (optional)", type: "number", step: "0.01" },
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
    totalWtManual: false,
    rate: "",
    rateManual: false,
    receivedQty: "",
  };
}

function createInvoice(fromType: string): InvoiceValues {
  return {
    id: crypto.randomUUID(),
    documentNo: "",
    date: "",
    receivedDate: "",
    fromType,
    toParty: "",
    lines: [createMaterialLine()],
  };
}

function emptySourceValues(): Record<string, string> {
  return {
    ...emptyValues(CARGO_FIELDS),
    dieselFilled: "false",
    maintenanceThisTrip: "false",
  };
}

/** Whole in-progress trip, saved to sessionStorage so it survives navigating
 * to another module (e.g. Materials, to look up a code) and back — the page
 * router unmounts this form on every navigation, which would otherwise wipe
 * all of its useState. Cleared once the trip actually saves or is discarded. */
interface CargoDraft {
  activeSourceType: string;
  values: Record<string, string>;
  invoices: InvoiceValues[];
  dieselSubValues: Record<string, string>;
  maintenanceSubValues: Record<string, string>;
  tripExpenseSubValues: Record<string, string>;
  savedDieselFillRef: string | null;
}

const CARGO_DRAFT_STORAGE_KEY = "sahyadri-cargo-transport-draft";

function loadCargoDraft(): CargoDraft | null {
  try {
    const raw = sessionStorage.getItem(CARGO_DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CargoDraft) : null;
  } catch {
    return null;
  }
}

function saveCargoDraft(draft: CargoDraft) {
  try {
    sessionStorage.setItem(CARGO_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private browsing, quota) — draft simply won't survive navigation.
  }
}

function clearCargoDraft() {
  try {
    sessionStorage.removeItem(CARGO_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Keeps an invoice's To valid for its (possibly just-changed) From — clears
 * it if it no longer appears in the new From's destination options. */
function applyInvoiceRoute(invoice: InvoiceValues, name: "fromType" | "toParty", value: string): InvoiceValues {
  const updated = { ...invoice, [name]: value };
  if (name === "fromType") {
    const { toOptions } = getCargoRouteDefaults(value);
    updated.toParty = toOptions.includes(updated.toParty) ? updated.toParty : "";
  }
  return updated;
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
      rate: "",
      rateManual: false,
      totalWtManual: false,
    };
  }

  return {
    ...line,
    materialCode: material.code,
    materialDescription: material.name,
    uom: material.weightPerPieceKg !== undefined ? "EA" : line.uom || "EA",
    perPartWt:
      material.weightPerPieceKg !== undefined ? String(material.weightPerPieceKg) : "",
    rate: "",
    rateManual: false,
    totalWtManual: false,
  };
}

/** Default rate suggestion — the material's fixed rate, else the trip-weight tier. */
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

/** Rate actually used for amount math — the user's manual override wins if present. */
function getLineFinalRate(
  line: MaterialLineValues,
  tripCalc: ReturnType<typeof calcCargoTransportByWeight>
) {
  if (line.rateManual && line.rate.trim() !== "" && !Number.isNaN(Number(line.rate))) {
    return { rate: Number(line.rate), rateTier: "Manual rate override" };
  }
  return getLineEffectiveRate(line, tripCalc);
}

function recalculateLine(line: MaterialLineValues): MaterialLineValues {
  if (line.totalWtManual) return line;

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
  invoices: InvoiceValues[],
  tripExpenseRef: string,
  receiptImageUrl: string
): Record<string, string | number>[] {
  const weighted = recalculateLineWeights(invoices);
  const totalTripWeight = getTotalTripWeight(weighted);
  const tripCalc = calcCargoTransportByWeight(totalTripWeight);

  return weighted.flatMap((invoice) => {
    const fromLabel = getAllCargoSources().find((s) => s.type === invoice.fromType)?.label ?? "";

    return invoice.lines.map((line) => {
      const lineWeight = Number(line.totalWt || 0);
      const { rate, rateTier } = getLineFinalRate(line, tripCalc);
      const transportRate = rate ?? "";
      const transportAmount =
        rate != null && lineWeight
          ? Math.round(lineWeight * rate * 100) / 100
          : "";

      return parseFormData({
        ...values,
        // A reference key, not an amount — safe to repeat on every row
        // (same idea as dieselFillRef). The actual toll/diesel-used amounts
        // live once on the linked Trip Expense record, not here.
        tripExpenseRef,
        // Drive link to the auto-captured Confirm & Save receipt — same
        // "safe to repeat per row" reference, blank if capture/upload failed.
        receiptImageUrl,
        plantType: invoice.fromType,
        fromLocation: fromLabel,
        toParty: invoice.toParty,
        documentNo: invoice.documentNo,
        date: invoice.date,
        // receipt stamp is per invoice (date) and per material line (qty)
        receivedDate: invoice.receivedDate,
        receivedQty: line.receivedQty,
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
    });
  });
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
      const existingPlantType = String(existing[0].data.plantType ?? existing[0].type);
      const sourceLabel =
        getAllCargoSources().find((s) => s.type === existingPlantType)?.label ??
        existingPlantType;
      return { documentNo: raw, source: sourceLabel };
    }
  }

  return null;
}

function suggestDieselFillRef(
  values: Record<string, string>,
  changedField: string,
  allDieselFills: LastDieselFill[]
): Record<string, string> {
  if (changedField !== "vehicleNo") return values;

  const vehicle = values.vehicleNo.trim();
  if (!vehicle) {
    return { ...values, dieselFillRef: "" };
  }

  const matchedFill = latestDieselFillForVehicle(allDieselFills, vehicle);
  return { ...values, dieselFillRef: matchedFill?.fillRef ?? "" };
}

/** Driver follows the field the user touched: explicit pick wins; picking a
 * vehicle suggests its assigned driver when no driver is chosen yet. */
function applyDriverSuggestion(
  values: Record<string, string>,
  changedField: string
): Record<string, string> {
  if (changedField === "driverId") {
    return { ...values, driverName: findDriverById(values.driverId)?.name ?? "" };
  }
  if (changedField === "vehicleNo" && !values.driverId) {
    const vehicle = getAllVehicles().find(
      (v) => v.registrationNo === values.vehicleNo.trim()
    );
    if (vehicle?.assignedDriverId) {
      return {
        ...values,
        driverId: vehicle.assignedDriverId,
        driverName:
          vehicle.assignedDriverName ||
          (findDriverById(vehicle.assignedDriverId)?.name ?? ""),
      };
    }
  }
  return values;
}

export function CargoTransportForm() {
  const [cargoSources, setCargoSources] = useState<CargoSource[]>(() => getAllCargoSources());
  const [activeSource, setActiveSource] = useState<CargoSource>(() => {
    const sources = getAllCargoSources();
    const draftType = loadCargoDraft()?.activeSourceType;
    return sources.find((s) => s.type === draftType) ?? sources[0];
  });
  const [values, setValues] = useState<Record<string, string>>(
    () => loadCargoDraft()?.values ?? emptySourceValues()
  );
  const [invoices, setInvoices] = useState<InvoiceValues[]>(
    () => loadCargoDraft()?.invoices ?? [createInvoice(getAllCargoSources()[0].type)]
  );
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [vehicleNoOptions, setVehicleNoOptions] = useState(() => getVehicleNoOptions());
  const [driverOptions, setDriverOptions] = useState(() => getDriverOptions());
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const sync = () => setVehicleNoOptions(getVehicleNoOptions());
    const syncDrivers = () => setDriverOptions(getDriverOptions());
    const syncLocations = () => setCargoSources(getAllCargoSources());
    window.addEventListener("sahyadri-vehicle-update", sync);
    window.addEventListener("sahyadri-local-update", syncDrivers);
    window.addEventListener("sahyadri-location-update", syncLocations);
    return () => {
      window.removeEventListener("sahyadri-vehicle-update", sync);
      window.removeEventListener("sahyadri-local-update", syncDrivers);
      window.removeEventListener("sahyadri-location-update", syncLocations);
    };
  }, []);

  // Diesel fill history comes straight from the Google Sheet — fetched once on
  // mount and re-fetched whenever any record saves anywhere in the app, no
  // localStorage involved.
  const [allDieselFills, setAllDieselFills] = useState<LastDieselFill[]>([]);
  useEffect(() => {
    const refetch = () => {
      fetchAllDieselFills().then(setAllDieselFills);
    };
    refetch();
    window.addEventListener("sahyadri-local-update", refetch);
    return () => window.removeEventListener("sahyadri-local-update", refetch);
  }, []);

  const [dieselSubValues, setDieselSubValues] = useState<Record<string, string>>(
    () => loadCargoDraft()?.dieselSubValues ?? emptyDieselSubValues()
  );
  const [maintenanceSubValues, setMaintenanceSubValues] = useState<Record<string, string>>(
    () => loadCargoDraft()?.maintenanceSubValues ?? emptyMaintenanceSubValues()
  );
  const [tripExpenseSubValues, setTripExpenseSubValues] = useState<Record<string, string>>(
    () => loadCargoDraft()?.tripExpenseSubValues ?? emptyTripExpenseSubValues()
  );
  // Tracks the ref actually persisted via "Save Diesel Fill Now", so the final
  // Save Trip submit doesn't create a second, duplicate Diesel Tank record for
  // the same fill. Cleared (by mismatching) whenever vehicle/first-invoice-date
  // change after a save, so a stale save can't silently swallow a new fill.
  const [savedDieselFillRef, setSavedDieselFillRef] = useState<string | null>(
    () => loadCargoDraft()?.savedDieselFillRef ?? null
  );
  const [savingDieselFill, setSavingDieselFill] = useState(false);

  // Keep the sessionStorage draft in sync with every change, so the trip
  // survives a navigation away (and the resulting unmount) and back.
  useEffect(() => {
    saveCargoDraft({
      activeSourceType: activeSource.type,
      values,
      invoices,
      dieselSubValues,
      maintenanceSubValues,
      tripExpenseSubValues,
      savedDieselFillRef,
    });
  }, [
    activeSource,
    values,
    invoices,
    dieselSubValues,
    maintenanceSubValues,
    tripExpenseSubValues,
    savedDieselFillRef,
  ]);

  const tripSections = useMemo(
    () =>
      TRIP_DETAIL_SECTIONS.map((section) => ({
        ...section,
        fields: section.fields.map((f) => {
          if (f.name === "vehicleNo" && vehicleNoOptions.length > 0) {
            return { ...f, type: "select" as const, options: vehicleNoOptions };
          }
          if (f.name === "driverId") {
            return {
              ...f,
              options: driverOptions.map((d) => ({ value: d.value, label: d.label })),
            };
          }
          return f;
        }),
      })),
    [vehicleNoOptions, driverOptions]
  );

  const tripFields = useMemo(() => tripSections.flatMap((s) => s.fields), [tripSections]);

  const vehicleDieselFills = useMemo(
    () => filterDieselFillsByVehicle(allDieselFills, values.vehicleNo),
    [allDieselFills, values.vehicleNo]
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
        const { rate } = getLineFinalRate(line, tripRate);
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
        const r = getLineFinalRate(line, tripRate).rate;
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
            !line.rateManual &&
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
    setValues((prev) =>
      applyDriverSuggestion(
        suggestDieselFillRef({ ...prev, [name]: value }, name, allDieselFills),
        name
      )
    );
    resetStatus();
  }

  async function handleSaveDieselFillNow() {
    const fillDate = invoices[0]?.date ?? "";
    if (!values.vehicleNo.trim() || !fillDate) {
      setStatus("error");
      setMessage("Enter vehicle and the first invoice's date before saving the diesel fill.");
      return;
    }
    if (!(Number(dieselSubValues.fillAmount) > 0)) {
      setStatus("error");
      setMessage("Enter a tank fill amount before saving the diesel fill.");
      return;
    }

    setSavingDieselFill(true);
    resetStatus();

    try {
      const fillRef = buildDieselFillRef(values.vehicleNo, fillDate);
      const result = await submitToSheet({
        type: "diesel",
        data: parseFormData({
          fillRef,
          date: fillDate,
          vehicleNo: values.vehicleNo,
          driverId: values.driverId,
          // Diesel Tank rows use "ID - Name" (matches the Diesel Tank module's
          // own driver select) — Cargo's own driverName field is plain-name-only.
          driverName: findDriverById(values.driverId)?.label ?? values.driverName,
          ...dieselSubValues,
        }),
      });

      if (!result.success) {
        setStatus("error");
        setMessage(result.message);
        return;
      }

      setValues((prev) => ({ ...prev, dieselFillRef: fillRef }));
      setSavedDieselFillRef(fillRef);
      // Re-fetch from the Sheet right away so the new fill is guaranteed to be
      // in "recent fills" before the user looks, instead of relying on the
      // background refetch from the "sahyadri-local-update" listener alone.
      setAllDieselFills(await fetchAllDieselFills());
      notify(`Diesel fill saved — ref "${fillRef}" is ready to pick in Trip Expenses below.`);
    } catch {
      setStatus("error");
      setMessage("Network error saving the diesel fill.");
    } finally {
      setSavingDieselFill(false);
    }
  }

  function handleDieselSubChange(name: string, value: string) {
    setDieselSubValues((prev) => applyDieselCalc({ ...prev, [name]: value }, name));
    resetStatus();
  }

  function handleTripExpenseSubChange(name: string, value: string) {
    setTripExpenseSubValues((prev) => ({ ...prev, [name]: value }));
    resetStatus();
  }

  function handleMaintenanceSubChange(name: string, value: string) {
    setMaintenanceSubValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "labourCost" || name === "partsCost") {
        const labour = Number(name === "labourCost" ? value : prev.labourCost) || 0;
        const parts = Number(name === "partsCost" ? value : prev.partsCost) || 0;
        next.totalCost = labour + parts > 0 ? String(Math.round((labour + parts) * 100) / 100) : "";
      }
      return next;
    });
    resetStatus();
  }

  function handleInvoiceChange(
    invoiceId: string,
    name: "documentNo" | "date" | "receivedDate",
    value: string
  ) {
    setInvoices((prev) =>
      prev.map((invoice) => (invoice.id === invoiceId ? { ...invoice, [name]: value } : invoice))
    );
    resetStatus();
  }

  function handleInvoiceRouteChange(
    invoiceId: string,
    name: "fromType" | "toParty",
    value: string
  ) {
    setInvoices((prev) =>
      prev.map((invoice) =>
        invoice.id === invoiceId ? applyInvoiceRoute(invoice, name, value) : invoice
      )
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
              if (name === "materialCode") {
                return applyMaterialDefaultsByCode(updated, value);
              }
              if (name === "totalWt") {
                return { ...updated, totalWtManual: true };
              }
              if (name === "rate") {
                return { ...updated, rateManual: true };
              }
              return updated;
            }),
          };
        })
      )
    );
    resetStatus();
  }

  function addInvoice() {
    setInvoices((prev) => [...prev, createInvoice(activeSource.type)]);
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

  function resetLinkedRecordState() {
    setDieselSubValues(emptyDieselSubValues());
    setMaintenanceSubValues(emptyMaintenanceSubValues());
    setTripExpenseSubValues(emptyTripExpenseSubValues());
    setSavedDieselFillRef(null);
  }

  function switchSource(source: CargoSource) {
    setActiveSource(source);
    setValues(emptySourceValues());
    setInvoices([createInvoice(source.type)]);
    resetLinkedRecordState();
    setStatus("idle");
    setMessage("");
  }

  /** Builds the review/receipt data from live form state — used both for
   * the Confirm dialog's visible review and (via captureCargoReceipt) for
   * the auto-captured receipt image, so the two never show different data. */
  function buildLiveCargoReceiptData(): CargoReceiptData {
    return {
      billingCompanyLabel: companyName(values.billingCompany),
      vehicleNo: values.vehicleNo,
      lrNo: values.lrNo,
      driverLabel: values.driverName || values.driverId,
      invoices: weightedInvoices.map((invoice) => ({
        documentNo: invoice.documentNo,
        date: invoice.date,
        receivedDate: invoice.receivedDate,
        routeLabel: `${
          cargoSources.find((s) => s.type === invoice.fromType)?.label ?? invoice.fromType
        } → ${invoice.toParty}`,
        lines: invoice.lines.map((line) => ({
          materialCode: line.materialCode,
          materialDescription: line.materialDescription,
          quantity: line.quantity,
          uom: line.uom,
          totalWt: line.totalWt,
          receivedQty: line.receivedQty,
        })),
      })),
      totalWeightLabel: `${Math.round(totalTripWeight * 1000) / 1000} kg`,
      rateLabel: summaryRateDisplay
        ? `${summaryRateDisplay.rate}${summaryRateDisplay.tier ? ` (${summaryRateDisplay.tier})` : ""}`
        : undefined,
      amountLabel: `Rs ${Math.round(totalTransportAmount * 100) / 100}`,
      dieselFillRef: values.dieselFillRef,
      dieselUsedThisTrip: tripExpenseSubValues.dieselUsedThisTrip,
      tollOverloadAmount: tripExpenseSubValues.tollOverloadAmount,
    };
  }

  async function performSave() {
    setSubmitting(true);

    const fillDate = invoices[0]?.date ?? "";

    try {
      // Trip Expense record is created *first* (if either amount is filled
      // in) so its ref is known before the cargo rows are built — each row
      // just carries the reference, never the raw amounts (which would
      // otherwise repeat once per material line and inflate a SUM() over
      // the column, since one trip can produce many rows).
      let tripExpenseRef = "";
      const hasTripExpense =
        Number(tripExpenseSubValues.dieselUsedThisTrip) > 0 ||
        Number(tripExpenseSubValues.tollOverloadAmount) > 0;
      if (hasTripExpense) {
        tripExpenseRef = buildTripExpenseRef(values.vehicleNo, fillDate);
        await submitToSheet({
          type: "trip-expense",
          data: parseFormData({
            id: tripExpenseRef,
            date: fillDate,
            vehicleNo: values.vehicleNo,
            driverId: values.driverId,
            driverName: findDriverById(values.driverId)?.label ?? values.driverName,
            source: "cargo",
            documentNos: invoices.map((inv) => inv.documentNo).filter(Boolean).join(", "),
            ...tripExpenseSubValues,
          }),
        });
      }

      // Best-effort: a capture/upload failure never blocks the trip save —
      // it just means this trip's receiptImageUrl stays blank. Captures an
      // independent, off-screen render (captureCargoReceipt) rather than
      // screenshotting the live dialog, so there's no dependency on the
      // dialog still being mounted at this point.
      let receiptImageUrl = "";
      try {
        const dataUrl = await captureCargoReceipt(buildLiveCargoReceiptData());
        receiptImageUrl = await uploadReceiptImage(
          dataUrl,
          `receipt-${values.vehicleNo || "trip"}-${fillDate || Date.now()}.jpg`
        );
      } catch (err) {
        console.warn("Receipt capture/upload failed (trip will still save):", err);
      }
      console.info("performSave: receiptImageUrl =", receiptImageUrl || "(blank)");

      const records = buildCargoPayloads(values, invoices, tripExpenseRef, receiptImageUrl);

      const result = await submitToSheet({
        type: "cargo",
        records,
      });

      if (!result.success) {
        setStatus("error");
        setMessage(result.message);
        return;
      }

      if (values.dieselFilled === "true") {
        const fillRef = buildDieselFillRef(values.vehicleNo, fillDate);
        // Skip re-creating it if "Save Diesel Fill Now" already persisted this
        // exact vehicle+date fill — otherwise (or if vehicle/date changed
        // since that save) create it now as a fallback.
        if (savedDieselFillRef !== fillRef) {
          await submitToSheet({
            type: "diesel",
            data: parseFormData({
              fillRef,
              date: fillDate,
              vehicleNo: values.vehicleNo,
              driverId: values.driverId,
              driverName: findDriverById(values.driverId)?.label ?? values.driverName,
              ...dieselSubValues,
            }),
          });
        }
      }

      if (values.maintenanceThisTrip === "true") {
        const vehicle = getAllVehicles().find((v) => v.registrationNo === values.vehicleNo.trim());
        const record: VehicleMaintenanceRecord = {
          id: getNextMaintenanceId(),
          vehicleId: vehicle?.id ?? "",
          vehicleNo: values.vehicleNo,
          date: fillDate,
          maintenanceType: maintenanceSubValues.maintenanceType,
          partName: maintenanceSubValues.partName,
          partNumber: maintenanceSubValues.partNumber,
          description: maintenanceSubValues.description,
          vendorName: maintenanceSubValues.vendorName,
          invoiceNo: maintenanceSubValues.invoiceNo,
          labourCost: maintenanceSubValues.labourCost,
          partsCost: maintenanceSubValues.partsCost,
          totalCost: maintenanceSubValues.totalCost,
          odometerKm: maintenanceSubValues.odometerKm,
          nextServiceKm: maintenanceSubValues.nextServiceKm,
          nextServiceDate: maintenanceSubValues.nextServiceDate,
          doneBy: maintenanceSubValues.doneBy,
          remarks: maintenanceSubValues.remarks,
          addedAt: new Date().toISOString(),
        };
        saveMaintenance(record);
      }

      notify(result.message);
      setValues(emptySourceValues());
      setInvoices([createInvoice(activeSource.type)]);
      resetLinkedRecordState();
      clearCargoDraft();
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and Web App URL.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDiscard() {
    setValues(emptySourceValues());
    setInvoices([createInvoice(activeSource.type)]);
    resetLinkedRecordState();
    clearCargoDraft();
    cancel();
    notify("Entry deleted — form cleared.", "error");
  }

  /** Standalone "start over" button — clears the form and its cached draft
   * without going through the Confirm & Save dialog (unlike handleDiscard,
   * which is that dialog's "Delete Entry" action). Confirms first since
   * there's no undo once the in-progress trip and its cache are gone. */
  function handleClearForm() {
    if (!window.confirm("Clear this form and its cached draft? This cannot be undone.")) {
      return;
    }
    setValues(emptySourceValues());
    setInvoices([createInvoice(activeSource.type)]);
    resetLinkedRecordState();
    clearCargoDraft();
    resetStatus();
    notify("Form cleared.", "error");
  }

  /**
   * Captures the review dialog as an image *before* handing off to
   * confirmSave — confirmSave clears the pending action (and so unmounts
   * the dialog) before awaiting it, so capturing inside performSave itself
   * would be racy. Uses html-to-image (SVG+foreignObject, rasterized by the
   * browser itself) rather than html2canvas — html2canvas hand-parses CSS
   * and can't handle the oklch/oklab colors Tailwind v4 generates, so it
   * threw on every capture; html-to-image has no such parser to trip over.
   * Capture failures are swallowed here (best-effort, per the plan): a
   * missing screenshot never blocks the save.
   */
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

        <div className="mt-3 flex overflow-x-auto rounded-lg border border-black/10 bg-white p-1 shadow-sm sm:flex-wrap">
          {cargoSources.map((source) => (
            <button
              key={source.type}
              type="button"
              onClick={() => switchSource(source)}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeSource.type === source.type
                  ? "bg-brand-tint font-semibold text-brand-text"
                  : "font-normal text-black hover:bg-black/5"
              }`}
            >
              {source.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-black">
          New invoices default to <span className="font-semibold">{activeSource.label}</span> —
          change From/To per invoice below if this trip covers more than one plant.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormSection
          title="1. Trip Details"
          description="Vehicle and driver for this trip."
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
              <div key={invoice.id} className="rounded-lg border border-black/10 bg-page p-2.5 shadow-sm sm:p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-black">
                    Invoice {invoiceIndex + 1}
                  </h4>
                  {invoices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInvoice(invoice.id)}
                      className="text-xs text-critical underline"
                    >
                      Remove invoice
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <FormField
                    field={{
                      name: "fromType",
                      label: "From",
                      type: "select",
                      required: true,
                      options: cargoSources.map((s) => ({ value: s.type, label: s.label })),
                    }}
                    id={`field-${invoice.id}-fromType`}
                    value={invoice.fromType}
                    onChange={(_, value) => handleInvoiceRouteChange(invoice.id, "fromType", value)}
                  />
                  <FormField
                    field={{
                      name: "toParty",
                      label: "To",
                      type: "select",
                      required: true,
                      options: getCargoRouteDefaults(invoice.fromType).toOptions,
                    }}
                    id={`field-${invoice.id}-toParty`}
                    value={invoice.toParty}
                    onChange={(_, value) => handleInvoiceRouteChange(invoice.id, "toParty", value)}
                  />
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <FormField
                    field={{
                      name: "documentNo",
                      label: "Invoice / DC No",
                      type: "text",
                      required: true,
                      placeholder: "e.g. 5900089218",
                    }}
                    id={`field-${invoice.id}-documentNo`}
                    value={invoice.documentNo}
                    onChange={(_, value) => handleInvoiceChange(invoice.id, "documentNo", value)}
                  />
                  <FormField
                    field={{ name: "date", label: "Date", type: "date", required: true }}
                    id={`field-${invoice.id}-date`}
                    value={invoice.date}
                    onChange={(_, value) => handleInvoiceChange(invoice.id, "date", value)}
                  />
                  <FormField
                    field={{
                      name: "receivedDate",
                      label: "Received Date (optional)",
                      type: "date",
                    }}
                    id={`field-${invoice.id}-receivedDate`}
                    value={invoice.receivedDate}
                    onChange={(_, value) => handleInvoiceChange(invoice.id, "receivedDate", value)}
                  />
                </div>

                <div className="mt-2.5 space-y-2">
                  {invoice.lines.map((line, lineIndex) => (
                    <div key={line.id} className="rounded-md border border-black/10 bg-white p-2 sm:p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-black">
                          Item {lineIndex + 1}
                        </span>
                        {invoice.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMaterialLine(invoice.id, line.id)}
                            className="text-xs text-critical underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                        {MATERIAL_ENTRY_FIELDS.map((field) => {
                          const displayValue =
                            field.name === "rate" && !line.rateManual
                              ? String(getLineEffectiveRate(line, tripRate).rate ?? "")
                              : (line[field.name as keyof MaterialLineValues] as string) ?? "";
                          return (
                            <div
                              key={`${line.id}-${field.name}`}
                              className={
                                field.name === "materialCode" || field.name === "materialDescription"
                                  ? "col-span-2"
                                  : undefined
                              }
                            >
                              <FormField
                                field={field}
                                id={`field-${line.id}-${field.name}`}
                                value={displayValue}
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
                          );
                        })}
                      </div>

                      {line.perPartWt && (
                        <div className="mt-2 text-xs text-black">
                          <span className="font-medium">Per piece:</span> {line.perPartWt} kg
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addMaterialLine(invoice.id)}
                  className="mt-2 text-xs font-medium text-brand-text underline sm:text-sm"
                >
                  + Add material to this invoice
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addInvoice}
              className="text-sm font-medium text-brand-text underline"
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
              <div className="rounded-md border border-black/10 bg-page px-2 py-1.5 text-sm text-black">
                <p className="text-xs font-medium text-black/60">Total Weight</p>
                <p className="text-sm sm:text-base">
                  {Math.round(totalTripWeight * 1000) / 1000} kg
                </p>
              </div>
              <div className="rounded-md border border-black/10 bg-page px-2 py-1.5 text-sm text-black">
                <p className="text-xs font-medium text-black/60">Rate</p>
                <p className="text-sm sm:text-base">{summaryRateDisplay.rate}</p>
                <p className="text-xs text-black/60">{summaryRateDisplay.tier}</p>
              </div>
              <div className="rounded-md border-t-2 border-brand bg-brand-tint px-2 py-1.5 text-sm text-black">
                <p className="text-xs font-medium text-black/60">Transport Amount</p>
                <p className="text-sm font-semibold sm:text-base">
                  Rs {Math.round(totalTransportAmount * 100) / 100}
                </p>
              </div>
            </div>
          </FormSection>
        )}

        <FormSection
          title="4. Diesel Tank Fill"
          description="Check this if the vehicle's tank was filled on this trip — save it here first so its ref is ready to pick in Trip Expenses below."
          accent="diesel"
        >
            <div className="sm:col-span-2">
              <ColoredCheckboxField
                id="field-dieselFilled"
                label="Diesel filled on this trip?"
                checked={values.dieselFilled === "true"}
                onChange={(checked) => handleChange("dieselFilled", checked ? "true" : "false")}
                category="diesel"
              />
            </div>
            {values.dieselFilled === "true" && (
              <>
                <div className="sm:col-span-2 grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
                  {DIESEL_SUBFORM_FIELDS.map((field) => (
                    <div key={field.name} className={field.colSpan === 2 ? "sm:col-span-2" : undefined}>
                      <FormField
                        field={field}
                        value={dieselSubValues[field.name]}
                        onChange={handleDieselSubChange}
                      />
                    </div>
                  ))}
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveDieselFillNow}
                    disabled={savingDieselFill}
                    className={DIESEL_BUTTON_CLASS}
                  >
                    {savingDieselFill ? "Saving…" : "Save Diesel Fill Now"}
                  </button>
                  {savedDieselFillRef === buildDieselFillRef(values.vehicleNo, invoices[0]?.date ?? "") &&
                    savedDieselFillRef && (
                      <span className="text-xs text-black">
                        Saved — ref <span className="font-semibold">{savedDieselFillRef}</span> ready below.
                      </span>
                    )}
                </div>
              </>
            )}
        </FormSection>

        {EXPENSE_SECTION && (
          <FormSection
            title="5. Trip Expenses"
            description={
              values.dieselFilled === "true"
                ? "Diesel and toll — saved as one Trip Expense record for the whole trip, not repeated per line."
                : "Diesel and toll for this trip. Tank wasn't filled today, so pick which prior fill this trip's diesel came from."
            }
          >
            {EXPENSE_SECTION.fields.map((field) => (
              <div key={field.name} className="sm:col-span-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
                <FormField
                  field={
                    field.name === "dieselFillRef" && values.dieselFilled !== "true"
                      ? { ...field, required: true }
                      : field
                  }
                  value={values[field.name]}
                  onChange={handleChange}
                />
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="recent-diesel-fills" className="text-xs font-medium text-black">
                    Recent fills
                  </label>
                  <select
                    id="recent-diesel-fills"
                    value={values.dieselFillRef || ""}
                    onChange={(e) => handleChange("dieselFillRef", e.target.value)}
                    disabled={!values.vehicleNo.trim() || vehicleDieselFills.length === 0}
                    className="w-full rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
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
            ))}
            {TRIP_EXPENSE_AMOUNT_FIELDS.map((field) => (
              <FormField
                key={field.name}
                field={field}
                value={tripExpenseSubValues[field.name]}
                onChange={handleTripExpenseSubChange}
              />
            ))}
          </FormSection>
        )}

        <FormSection
          title="6. Vehicle Maintenance"
          description="Check this if maintenance was done on this trip — it creates a Vehicle Maintenance record linked to this vehicle and date."
          accent="maintenance"
        >
          <div className="sm:col-span-2">
            <ColoredCheckboxField
              id="field-maintenanceThisTrip"
              label="Maintenance done on this trip?"
              checked={values.maintenanceThisTrip === "true"}
              onChange={(checked) => handleChange("maintenanceThisTrip", checked ? "true" : "false")}
              category="maintenance"
            />
          </div>
        </FormSection>

        {values.maintenanceThisTrip === "true" &&
          MAINTENANCE_SUBFORM_SECTIONS.map((section) => (
            <FormSection
              key={section.id}
              title={section.title}
              columns={section.id === "type-description" ? 2 : section.id === "cost" ? 3 : 4}
            >
              {section.fields.map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={maintenanceSubValues[field.name]}
                  onChange={handleMaintenanceSubChange}
                />
              ))}
            </FormSection>
          ))}

        <StatusMessage type={status} message={message} />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClearForm}
            className="rounded-md border border-black/15 bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/5"
          >
            Clear Form
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Trip"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Trip Entry"
        message="Check the entry below, then save."
        confirmLabel="Confirm & Save"
        cancelLabel="Edit"
        deleteLabel="Delete Entry"
        onConfirm={confirmSave}
        onCancel={cancel}
        onDelete={handleDiscard}
      >
        <CargoTripReceipt data={buildLiveCargoReceiptData()} />
      </ConfirmDialog>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
