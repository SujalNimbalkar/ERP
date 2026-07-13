"use client";

import { useEffect, useState } from "react";
import { submitToSheet } from "@/lib/api";
import {
  SALARY_FIELDS,
  SALARY_PAY_DATES,
  emptyValues,
  parseFormData,
} from "@/lib/sheetConfig";
import { getPayeeOptions, findPayeeById, type StaffOption } from "@/lib/staffStore";
import type { FieldConfig } from "@/lib/types";
import { FormField } from "@/components/ui/FormField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

function visibleSalaryFields(paymentType: string, payeeOptions: StaffOption[]): FieldConfig[] {
  return SALARY_FIELDS.filter((field) => {
    if (field.name === "scheduledSalaryDate") {
      return paymentType === "Regular Salary" || paymentType === "Delayed Payment";
    }
    if (field.name === "reason") {
      return paymentType === "Advance Payment" || paymentType === "Delayed Payment";
    }
    return true;
  }).map((field) => {
    if (field.name === "reason") {
      return {
        ...field,
        required: true,
        placeholder:
          paymentType === "Advance Payment"
            ? "e.g. Medical emergency, festival advance"
            : "e.g. Driver absent, payment held, insufficient funds",
      };
    }
    if (field.name === "scheduledSalaryDate" && paymentType === "Delayed Payment") {
      return {
        ...field,
        label: "Original Due Date",
        placeholder: "Which scheduled date was missed",
      };
    }
    if (field.name === "driverId") {
      return {
        ...field,
        options: payeeOptions.map((p) => ({ value: p.value, label: p.label })),
      };
    }
    return field;
  });
}

export function DriverSalaryForm() {
  const [values, setValues] = useState(() => emptyValues(SALARY_FIELDS));
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payeeOptions, setPayeeOptions] = useState(() => getPayeeOptions());
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  const paymentType = values.paymentType;
  const fields = visibleSalaryFields(paymentType, payeeOptions);

  useEffect(() => {
    const sync = () => setPayeeOptions(getPayeeOptions());

    window.addEventListener("sahyadri-local-update", sync);
    window.addEventListener("sahyadri-staff-update", sync);
    return () => {
      window.removeEventListener("sahyadri-local-update", sync);
      window.removeEventListener("sahyadri-staff-update", sync);
    };
  }, []);

  function handleChange(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "paymentType") {
        if (value === "Regular Salary") {
          next.reason = "";
          const selectedPayee = next.driverId ? findPayeeById(next.driverId) : undefined;
          if (selectedPayee?.rate) {
            next.amount = selectedPayee.rate;
          }
        }
        if (value === "Advance Payment") {
          next.scheduledSalaryDate = "";
        }
      }

      if (name === "driverId") {
        const selectedPayee = findPayeeById(value);
        next.driverId = value;
        next.driverName = selectedPayee?.name ?? "";
        if (paymentType === "Regular Salary" && selectedPayee?.rate) {
          next.amount = selectedPayee.rate;
        }
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
        type: "salary",
        data: parseFormData(values),
      });

      if (result.success) {
        notify(result.message);
        setValues(emptyValues(SALARY_FIELDS));
        setPayeeOptions(getPayeeOptions());
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

    if (
      (paymentType === "Advance Payment" || paymentType === "Delayed Payment") &&
      !values.reason.trim()
    ) {
      setStatus("error");
      setMessage("Reason is required for advance and delayed payments.");
      return;
    }

    if (
      (paymentType === "Regular Salary" || paymentType === "Delayed Payment") &&
      !values.scheduledSalaryDate
    ) {
      setStatus("error");
      setMessage("Please select the scheduled salary date.");
      return;
    }

    requestConfirm(performSave);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Salary</h2>
        <p className="mt-1 text-sm text-black">
          Salary is paid on 4 fixed dates each month:{" "}
          {SALARY_PAY_DATES.join(", ")}. Record regular salary, advances, or
          delayed payments with a reason.
        </p>
        {payeeOptions.length === 0 && (
          <p className="mt-2 border border-black px-3 py-2 text-xs text-black">
            No drivers or staff saved yet. Create driver details in Driver Master or add
            staff in Staff Master first.
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
          {submitting ? "Saving…" : "Save to Salary Sheet"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        message="Save this salary entry?"
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
