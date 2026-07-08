"use client";

import { useEffect, useState } from "react";
import { submitToSheet } from "@/lib/api";
import {
  DIESEL_FILL_FIELDS,
  emptyValues,
  parseFormData,
} from "@/lib/sheetConfig";
import {
  buildDieselFillRef,
  loadLastDieselFill,
  saveLastDieselFill,
} from "@/lib/dieselUtils";
import { getDriverOptions } from "@/lib/driverStore";
import { FormField } from "@/components/ui/FormField";
import { StatusMessage } from "@/components/ui/StatusMessage";

function applyFillRef(values: Record<string, string>): Record<string, string> {
  const fillRef = buildDieselFillRef(values.vehicleNo, values.date);
  return fillRef ? { ...values, fillRef } : values;
}

export function DieselTankForm() {
  const lastFill = loadLastDieselFill();
  const [values, setValues] = useState(() => applyFillRef(emptyValues(DIESEL_FILL_FIELDS)));
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [driverOptions, setDriverOptions] = useState(() => getDriverOptions());

  useEffect(() => {
    const sync = () => setDriverOptions(getDriverOptions());
    window.addEventListener("sahyadri-local-update", sync);
    return () => window.removeEventListener("sahyadri-local-update", sync);
  }, []);

  const fields = DIESEL_FILL_FIELDS.map((field) =>
    field.name === "driverName"
      ? { ...field, options: driverOptions.map((d) => d.label) }
      : field
  );

  function handleChange(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "vehicleNo" || name === "date") {
        return applyFillRef(next);
      }
      return next;
    });
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
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
        saveLastDieselFill({
          fillRef: withRef.fillRef,
          vehicleNo: withRef.vehicleNo,
          fillAmount: withRef.fillAmount,
          date: withRef.date,
        });
        setStatus("success");
        setMessage(
          `${result.message}. Use Fill Ref "${withRef.fillRef}" on cargo trips covered by this tank.`
        );
        setValues(applyFillRef(emptyValues(DIESEL_FILL_FIELDS)));
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
    </div>
  );
}
