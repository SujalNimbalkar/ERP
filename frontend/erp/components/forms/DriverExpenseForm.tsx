"use client";

import { useEffect, useMemo, useState } from "react";
import { submitToSheet } from "@/lib/api";
import { DRIVER_EXPENSE_FIELDS, emptyValues, parseFormData } from "@/lib/sheetConfig";
import { getPayeeOptions, findPayeeById } from "@/lib/staffStore";
import { getLocalRecordsByType } from "@/lib/localStore";
import type { FieldConfig } from "@/lib/types";
import { FormField } from "@/components/ui/FormField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialValues(): Record<string, string> {
  return { ...emptyValues(DRIVER_EXPENSE_FIELDS), date: today() };
}

/** Total expenses recorded for this payee in the month of the given date. */
function payeeMonthTotal(driverId: string, date: string): number {
  const month = date.slice(0, 7);
  if (!driverId || !month) return 0;
  return getLocalRecordsByType("driver-expense")
    .filter(
      (r) =>
        String(r.data.driverId) === driverId &&
        String(r.data.date ?? "").startsWith(month)
    )
    .reduce((sum, r) => sum + (Number(r.data.amount) || 0), 0);
}

export function DriverExpenseForm() {
  const [values, setValues] = useState<Record<string, string>>(() => createInitialValues());
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payeeOptions, setPayeeOptions] = useState(() => getPayeeOptions());
  const [recordsVersion, setRecordsVersion] = useState(0);
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  useEffect(() => {
    const sync = () => {
      setPayeeOptions(getPayeeOptions());
      setRecordsVersion((v) => v + 1);
    };
    window.addEventListener("sahyadri-local-update", sync);
    window.addEventListener("sahyadri-staff-update", sync);
    return () => {
      window.removeEventListener("sahyadri-local-update", sync);
      window.removeEventListener("sahyadri-staff-update", sync);
    };
  }, []);

  const fields: FieldConfig[] = useMemo(
    () =>
      DRIVER_EXPENSE_FIELDS.map((field) =>
        field.name === "driverId"
          ? {
              ...field,
              options: payeeOptions.map((p) => ({ value: p.value, label: p.label })),
            }
          : field
      ),
    [payeeOptions]
  );

  const monthTotal = useMemo(
    () => payeeMonthTotal(values.driverId, values.date),
    // recordsVersion re-reads localStorage after every save
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.driverId, values.date, recordsVersion]
  );

  function handleChange(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "driverId") {
        next.driverName = findPayeeById(value)?.name ?? "";
      }
      return next;
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

    try {
      const result = await submitToSheet({
        type: "driver-expense",
        data: parseFormData(values),
      });

      if (result.success) {
        notify(result.message);
        setValues((prev) => ({
          ...createInitialValues(),
          // keep driver + date so several expenses of one day enter quickly
          driverId: prev.driverId,
          driverName: prev.driverName,
          date: prev.date,
        }));
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
    if (!(Number(values.amount) > 0)) {
      setStatus("error");
      setMessage("Enter an expense amount greater than zero.");
      return;
    }
    requestConfirm(performSave);
  }

  const selectedPayee = values.driverId ? findPayeeById(values.driverId) : undefined;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-black">Daily Expenses</h2>
        <p className="mt-1 text-sm text-black">
          Food, travel, daily wages and other day-to-day expenses — separate from salary,
          one entry per expense.
        </p>
        {payeeOptions.length === 0 && (
          <p className="mt-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black shadow-sm">
            No drivers or staff saved yet. Create driver details in Driver Master or add
            staff in Staff Master first.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.name}
              className={field.colSpan === 2 ? "sm:col-span-2" : undefined}
            >
              <FormField field={field} value={values[field.name]} onChange={handleChange} />
            </div>
          ))}
        </div>

        {selectedPayee && (
          <p className="rounded-md border-l-4 border-brand bg-brand-tint px-3 py-2 text-xs text-black">
            {selectedPayee.name} — expenses in {values.date.slice(0, 7)}:{" "}
            <span className="font-semibold">
              Rs {monthTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </p>
        )}

        <StatusMessage type={status} message={message} />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        message={`Save ${values.expenseType || "expense"} of Rs ${values.amount || "0"} for ${values.driverName || "payee"}?`}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
