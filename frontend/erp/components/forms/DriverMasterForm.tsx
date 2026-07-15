"use client";

import { useMemo, useState } from "react";
import { submitToSheet } from "@/lib/api";
import { DRIVER_MASTER_FIELDS, emptyValues, parseFormData } from "@/lib/sheetConfig";
import { getNextDriverId } from "@/lib/driverStore";
import { FormField } from "@/components/ui/FormField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

function createInitialValues() {
  return {
    ...emptyValues(DRIVER_MASTER_FIELDS),
    driverId: getNextDriverId(),
  };
}

export function DriverMasterForm() {
  const [values, setValues] = useState<Record<string, string>>(() => createInitialValues());
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  const fields = useMemo(() => DRIVER_MASTER_FIELDS, []);

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  }

  async function performSave() {
    setSubmitting(true);
    setStatus("idle");
    setMessage("");

    try {
      const result = await submitToSheet({
        type: "drivers",
        data: parseFormData(values),
      });

      if (result.success) {
        notify(`${result.message} Driver created with ID ${values.driverId}.`);
        setValues(createInitialValues());
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestConfirm(performSave);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Driver Master</h2>
        <p className="mt-1 text-sm text-black">
          Save basic driver details with an auto-generated `driver_id` for salary linkage
          and future dashboards.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.name}
              className={field.colSpan === 2 ? "sm:col-span-2" : undefined}
            >
              <FormField field={field} value={values[field.name]} onChange={handleChange} />
            </div>
          ))}
        </div>

        <StatusMessage type={status} message={message} />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Driver"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        message="Save this driver?"
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
