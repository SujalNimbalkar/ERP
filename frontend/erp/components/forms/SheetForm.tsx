"use client";

import { useState } from "react";
import type { FieldConfig, SheetType } from "@/lib/types";
import { submitToSheet } from "@/lib/api";
import { emptyValues, parseFormData } from "@/lib/sheetConfig";
import { FormField } from "@/components/ui/FormField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

interface SheetFormProps {
  title: string;
  sheetType: SheetType;
  fields: FieldConfig[];
  headerExtra?: React.ReactNode;
}

export function SheetForm({
  title,
  sheetType,
  fields,
  headerExtra,
}: SheetFormProps) {
  const [values, setValues] = useState(() => emptyValues(fields));
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

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
        type: sheetType,
        data: parseFormData(values),
      });

      if (result.success) {
        notify(result.message);
        setValues(emptyValues(fields));
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
        <h2 className="text-xl font-semibold text-black">{title}</h2>
        {headerExtra}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <FormField
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={handleChange}
            />
          ))}
        </div>

        <StatusMessage type={status} message={message} />

        <button
          type="submit"
          disabled={submitting}
          className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save to Sheet"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        message={`Save this ${title} entry?`}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
