"use client";

import { useEffect, useState } from "react";
import { submitToSheet } from "@/lib/api";
import {
  DIESEL_FILL_FIELDS,
  DIESEL_RATE_PER_LITER,
  emptyValues,
  injectOptions,
  parseFormData,
} from "@/lib/sheetConfig";
import { applyDieselCalc, buildDieselFillRef, type LastDieselFill } from "@/lib/dieselUtils";
import { getDriverOptions } from "@/lib/driverStore";
import { getVehicleNoOptions } from "@/lib/vehicleStore";
import { FormField } from "@/components/ui/FormField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

function applyFillRef(values: Record<string, string>): Record<string, string> {
  const fillRef = buildDieselFillRef(values.vehicleNo, values.date);
  return fillRef ? { ...values, fillRef } : values;
}

function initialValues(): Record<string, string> {
  return applyFillRef({
    ...emptyValues(DIESEL_FILL_FIELDS),
    ratePerLiter: String(DIESEL_RATE_PER_LITER),
  });
}

export function DieselTankForm() {
  // Reminder banner for whatever was just saved this session — not persisted
  // anywhere, so it's simply empty again after a page reload (the Sheet
  // itself, not localStorage, is the source of truth for actual fill history).
  const [lastFill, setLastFill] = useState<LastDieselFill | null>(null);
  const [values, setValues] = useState(() => initialValues());
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [driverOptions, setDriverOptions] = useState(() => getDriverOptions());
  const [vehicleNoOptions, setVehicleNoOptions] = useState(() => getVehicleNoOptions());
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const syncDrivers = () => setDriverOptions(getDriverOptions());
    const syncVehicles = () => setVehicleNoOptions(getVehicleNoOptions());
    window.addEventListener("sahyadri-local-update", syncDrivers);
    window.addEventListener("sahyadri-vehicle-update", syncVehicles);
    return () => {
      window.removeEventListener("sahyadri-local-update", syncDrivers);
      window.removeEventListener("sahyadri-vehicle-update", syncVehicles);
    };
  }, []);

  const fields = injectOptions(
    injectOptions(DIESEL_FILL_FIELDS, "vehicleNo", vehicleNoOptions),
    "driverName",
    driverOptions.map((d) => d.label)
  );

  function handleChange(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "vehicleNo" || name === "date") {
        return applyFillRef(next);
      }
      if (name === "driverName") {
        const driver = driverOptions.find((d) => d.label === value);
        next.driverId = driver?.value ?? "";
      }
      return applyDieselCalc(next, name);
    });
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  async function performSave() {
    setSubmitting(true);
    setStatus("idle");
    setMessage("");

    const withRef = applyFillRef(values);

    try {
      const result = await submitToSheet({
        type: "diesel",
        data: parseFormData(withRef),
      });

      if (result.success) {
        setLastFill({
          fillRef: withRef.fillRef,
          vehicleNo: withRef.vehicleNo,
          fillAmount: withRef.fillAmount,
          date: withRef.date,
        });
        notify(
          `${result.message}. Use Fill Ref "${withRef.fillRef}" on cargo trips covered by this tank.`
        );
        setValues(initialValues());
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

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    requestConfirm(performSave);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Diesel Tank Fill</h2>
        <p className="mt-1 text-sm text-black">
          Log when a vehicle tank is filled completely. One fill can cover multiple
          cargo trips — this Fill Ref is auto-suggested on cargo entries for the same
          vehicle.
        </p>
        {lastFill && (
          <p className="mt-2 border border-black px-3 py-2 text-xs text-black">
            Last fill: <span className="font-semibold">{lastFill.fillRef}</span>
            {lastFill.fillAmount && ` · Rs ${lastFill.fillAmount}`}
            {" · "}
            Use this ref on cargo trips until the next tank fill.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.name}
              className={field.colSpan === 2 ? "sm:col-span-2" : undefined}
            >
              <FormField
                field={field}
                value={values[field.name]}
                onChange={handleChange}
              />
            </div>
          ))}
        </div>

        <StatusMessage type={status} message={message} />

        <button
          type="submit"
          disabled={submitting}
          className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save Tank Fill"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        message="Save this diesel tank fill?"
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
