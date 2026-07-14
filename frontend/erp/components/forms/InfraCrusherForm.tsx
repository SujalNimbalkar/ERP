"use client";

import { useEffect, useMemo, useState } from "react";
import { submitToSheet } from "@/lib/api";
import {
  DIESEL_RATE_PER_LITER,
  DIESEL_SUBFORM_FIELDS,
  INFRA_FIELDS,
  TRIP_EXPENSE_AMOUNT_FIELDS,
  TRIP_EXPENSE_FIELDS,
  buildTripExpenseRef,
  emptyValues,
  injectOptions,
  parseFormData,
  recalcInfraAmounts,
} from "@/lib/sheetConfig";
import {
  applyDieselCalc,
  buildDieselFillRef,
  fetchAllDieselFills,
  filterDieselFillsByVehicle,
  latestDieselFillForVehicle,
  type LastDieselFill,
} from "@/lib/dieselUtils";
import { findDriverById, getDriverOptions } from "@/lib/driverStore";
import {
  MAINTENANCE_SUBFORM_SECTIONS,
  getAllVehicles,
  getNextMaintenanceId,
  getVehicleNoOptions,
  saveMaintenance,
  type VehicleMaintenanceRecord,
} from "@/lib/vehicleStore";
import type { FieldConfig } from "@/lib/types";
import { FormField } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { ColoredCheckboxField } from "@/components/ui/ColoredCheckboxField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

const TRIP_DETAIL_NAMES = ["date", "vehicleNo", "driverId", "driverName"];
const CRUSHER_NAMES = ["crusherChallanNo", "materialType", "crusherRate", "crusherBrass", "crusherLocation", "crusherAmount"];
const SALE_NAMES = ["challanNo", "customerName", "clientLocation", "qtyBrass", "rate", "totalAmount", "difference"];

/** Amber-filled button, standing out from the app's usual black-border/white
 * buttons — diesel is amber (fuel) throughout the app. */
const DIESEL_BUTTON_CLASS =
  "border border-amber-700 bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50";

function emptyDieselSubValues(): Record<string, string> {
  return { ...emptyValues(DIESEL_SUBFORM_FIELDS), ratePerLiter: String(DIESEL_RATE_PER_LITER) };
}

function emptyMaintenanceSubValues(): Record<string, string> {
  return emptyValues(MAINTENANCE_SUBFORM_SECTIONS.flatMap((s) => s.fields));
}

function emptyTripExpenseSubValues(): Record<string, string> {
  return emptyValues(TRIP_EXPENSE_AMOUNT_FIELDS);
}

function emptyInfraValues(): Record<string, string> {
  return {
    ...emptyValues(INFRA_FIELDS),
    dieselFilled: "false",
    maintenanceThisTrip: "false",
  };
}

/** Driver follows vehicle assignment (unless already picked); diesel fill ref
 * suggests the vehicle's latest tank fill (from the already-fetched sheet
 * data) — same pattern as Cargo Transport. */
function applyVehicleLinkedSuggestions(
  values: Record<string, string>,
  changedField: string,
  allDieselFills: LastDieselFill[]
): Record<string, string> {
  if (changedField === "driverId") {
    return { ...values, driverName: findDriverById(values.driverId)?.name ?? "" };
  }
  if (changedField === "vehicleNo") {
    let next = { ...values };
    if (!next.driverId) {
      const vehicle = getAllVehicles().find((v) => v.registrationNo === next.vehicleNo.trim());
      if (vehicle?.assignedDriverId) {
        next = {
          ...next,
          driverId: vehicle.assignedDriverId,
          driverName: vehicle.assignedDriverName || (findDriverById(vehicle.assignedDriverId)?.name ?? ""),
        };
      }
    }
    const vehicle = next.vehicleNo.trim();
    const matchedFill = vehicle ? latestDieselFillForVehicle(allDieselFills, vehicle) : null;
    next = { ...next, dieselFillRef: matchedFill?.fillRef ?? "" };
    return next;
  }
  return values;
}

function fieldsByNames(fields: FieldConfig[], names: string[]): FieldConfig[] {
  return names
    .map((name) => fields.find((f) => f.name === name))
    .filter((f): f is FieldConfig => Boolean(f));
}

export function InfraCrusherForm() {
  const [values, setValues] = useState<Record<string, string>>(() => emptyInfraValues());
  const [dieselSubValues, setDieselSubValues] = useState<Record<string, string>>(() =>
    emptyDieselSubValues()
  );
  const [maintenanceSubValues, setMaintenanceSubValues] = useState<Record<string, string>>(() =>
    emptyMaintenanceSubValues()
  );
  const [tripExpenseSubValues, setTripExpenseSubValues] = useState<Record<string, string>>(() =>
    emptyTripExpenseSubValues()
  );
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [vehicleNoOptions, setVehicleNoOptions] = useState(() => getVehicleNoOptions());
  const [driverOptions, setDriverOptions] = useState(() => getDriverOptions());
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const syncVehicles = () => setVehicleNoOptions(getVehicleNoOptions());
    const syncDrivers = () => setDriverOptions(getDriverOptions());
    window.addEventListener("sahyadri-vehicle-update", syncVehicles);
    window.addEventListener("sahyadri-local-update", syncDrivers);
    return () => {
      window.removeEventListener("sahyadri-vehicle-update", syncVehicles);
      window.removeEventListener("sahyadri-local-update", syncDrivers);
    };
  }, []);

  // Diesel fill history comes straight from the Google Sheet — fetched once on
  // mount and re-fetched whenever any record saves anywhere in the app (so a
  // fill entered elsewhere shows up here too), no localStorage involved.
  const [allDieselFills, setAllDieselFills] = useState<LastDieselFill[]>([]);
  useEffect(() => {
    const refetch = () => {
      fetchAllDieselFills().then(setAllDieselFills);
    };
    refetch();
    window.addEventListener("sahyadri-local-update", refetch);
    return () => window.removeEventListener("sahyadri-local-update", refetch);
  }, []);

  const fields = useMemo(() => {
    const withVehicle = injectOptions(INFRA_FIELDS, "vehicleNo", vehicleNoOptions);
    return withVehicle.map((f) =>
      f.name === "driverId"
        ? { ...f, options: driverOptions.map((d) => ({ value: d.value, label: d.label })) }
        : f
    );
  }, [vehicleNoOptions, driverOptions]);

  const tripDetailFields = useMemo(() => fieldsByNames(fields, TRIP_DETAIL_NAMES), [fields]);
  const crusherFields = useMemo(() => fieldsByNames(fields, CRUSHER_NAMES), [fields]);
  const saleFields = useMemo(() => fieldsByNames(fields, SALE_NAMES), [fields]);

  // Tracks the ref actually persisted via "Save Diesel Fill Now", so the final
  // Save Trip submit doesn't create a second, duplicate Diesel Tank record for
  // the same fill. Cleared (by mismatching) whenever vehicle/date change after
  // a save, so a stale save can't silently swallow a fill for a new vehicle/date.
  const [savedDieselFillRef, setSavedDieselFillRef] = useState<string | null>(null);
  const [savingDieselFill, setSavingDieselFill] = useState(false);

  const vehicleDieselFills = useMemo(
    () => filterDieselFillsByVehicle(allDieselFills, values.vehicleNo),
    [allDieselFills, values.vehicleNo]
  );

  function resetStatus() {
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  function handleChange(name: string, value: string) {
    setValues((prev) =>
      recalcInfraAmounts(applyVehicleLinkedSuggestions({ ...prev, [name]: value }, name, allDieselFills))
    );
    resetStatus();
  }

  async function handleSaveDieselFillNow() {
    if (!values.vehicleNo.trim() || !values.date) {
      setStatus("error");
      setMessage("Enter vehicle and date before saving the diesel fill.");
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
      const fillRef = buildDieselFillRef(values.vehicleNo, values.date);
      const result = await submitToSheet({
        type: "diesel",
        data: parseFormData({
          fillRef,
          date: values.date,
          vehicleNo: values.vehicleNo,
          driverId: values.driverId,
          // Diesel Tank rows use "ID - Name" (matches the Diesel Tank module's
          // own driver select) — Infra's own driverName field is plain-name-only.
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

  function resetAll() {
    setValues(emptyInfraValues());
    setDieselSubValues(emptyDieselSubValues());
    setMaintenanceSubValues(emptyMaintenanceSubValues());
    setTripExpenseSubValues(emptyTripExpenseSubValues());
    setSavedDieselFillRef(null);
  }

  async function performSave() {
    setSubmitting(true);
    setStatus("idle");
    setMessage("");

    try {
      // Trip Expense record is created *first* (if either amount is filled
      // in) so its ref is known before the Infra row is built — the row just
      // carries the reference, never the raw amounts (those would repeat
      // per-row on Cargo and inflate a SUM() over the column; kept the same
      // shape here for schema consistency between the two forms).
      let tripExpenseRef = "";
      const hasTripExpense =
        Number(tripExpenseSubValues.dieselUsedThisTrip) > 0 ||
        Number(tripExpenseSubValues.tollOverloadAmount) > 0;
      if (hasTripExpense) {
        tripExpenseRef = buildTripExpenseRef(values.vehicleNo, values.date);
        await submitToSheet({
          type: "trip-expense",
          data: parseFormData({
            id: tripExpenseRef,
            date: values.date,
            vehicleNo: values.vehicleNo,
            driverId: values.driverId,
            driverName: findDriverById(values.driverId)?.label ?? values.driverName,
            source: "infra",
            ...tripExpenseSubValues,
          }),
        });
      }

      const infraResult = await submitToSheet({
        type: "infra",
        data: parseFormData({ ...values, tripExpenseRef }),
      });

      if (!infraResult.success) {
        setStatus("error");
        setMessage(infraResult.message);
        return;
      }

      if (values.dieselFilled === "true") {
        const fillRef = buildDieselFillRef(values.vehicleNo, values.date);
        // Skip re-creating it if "Save Diesel Fill Now" already persisted this
        // exact vehicle+date fill — otherwise (or if vehicle/date changed
        // since that save) create it now as a fallback.
        if (savedDieselFillRef !== fillRef) {
          await submitToSheet({
            type: "diesel",
            data: parseFormData({
              fillRef,
              date: values.date,
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
          date: values.date,
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

      notify(infraResult.message);
      resetAll();
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and Web App URL.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDiscard() {
    resetAll();
    cancel();
    notify("Entry deleted — form cleared.", "error");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetStatus();
    requestConfirm(performSave);
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-black">Infra & Crusher Transport</h2>
        <p className="mt-1 text-sm text-black">
          Crusher and sand transport entries — driver, diesel, and maintenance link directly
          from here, no need to visit those modules separately.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormSection title="1. Trip Details" columns={3}>
          {tripDetailFields.map((field) => (
            <FormField key={field.name} field={field} value={values[field.name]} onChange={handleChange} />
          ))}
        </FormSection>

        <FormSection title="2. Crusher" description="Crusher Amount auto-calculates from Crusher Rate x Crusher Brass." columns={3}>
          {crusherFields.map((field) => (
            <FormField key={field.name} field={field} value={values[field.name]} onChange={handleChange} />
          ))}
        </FormSection>

        <FormSection title="3. Sale" description="Total Amount auto-calculates from Selling Rate x Qty Brass; Difference is the crusher-to-sale margin." columns={3}>
          {saleFields.map((field) => (
            <FormField key={field.name} field={field} value={values[field.name]} onChange={handleChange} />
          ))}
        </FormSection>

        <div className="border-2 border-amber-500 p-1.5">
          <FormSection title="4. Diesel Tank Fill" description="Check this if the vehicle's tank was filled on this trip — save it here first so its ref is ready to pick in Trip Expenses below.">
            <div className="sm:col-span-2">
              <ColoredCheckboxField
                id="field-dieselFilled"
                label="Diesel filled on this trip?"
                checked={values.dieselFilled === "true"}
                onChange={(checked) => handleChange("dieselFilled", checked ? "true" : "false")}
                color="amber"
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
                  {savedDieselFillRef === buildDieselFillRef(values.vehicleNo, values.date) &&
                    savedDieselFillRef && (
                      <span className="text-xs text-black">
                        Saved — ref <span className="font-semibold">{savedDieselFillRef}</span> ready below.
                      </span>
                    )}
                </div>
              </>
            )}
          </FormSection>
        </div>

        <FormSection
          title="5. Trip Expenses"
          description={
            values.dieselFilled === "true"
              ? "Diesel share and toll for this trip — saved as one Trip Expense record for the whole trip, not repeated per line."
              : "Diesel share and toll for this trip. Tank wasn't filled today, so pick which prior fill this trip's diesel came from."
          }
        >
          {TRIP_EXPENSE_FIELDS.map((field) => (
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

        <div className="space-y-3 border-2 border-blue-500 p-1.5">
          <FormSection title="6. Vehicle Maintenance" description="Check this if maintenance was done on this trip — it creates a Vehicle Maintenance record linked to this vehicle and date.">
            <div className="sm:col-span-2">
              <ColoredCheckboxField
                id="field-maintenanceThisTrip"
                label="Maintenance done on this trip?"
                checked={values.maintenanceThisTrip === "true"}
                onChange={(checked) => handleChange("maintenanceThisTrip", checked ? "true" : "false")}
                color="blue"
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
        </div>

        <StatusMessage type={status} message={message} />

        <button
          type="submit"
          disabled={submitting}
          className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save Trip"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Infra & Crusher Entry"
        message="Check the entry below, then save."
        confirmLabel="Confirm & Save"
        cancelLabel="Edit"
        deleteLabel="Delete Entry"
        onConfirm={confirmSave}
        onCancel={cancel}
        onDelete={handleDiscard}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}
