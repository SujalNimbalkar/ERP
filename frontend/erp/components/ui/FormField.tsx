"use client";

import type { FieldConfig } from "@/lib/types";

interface FormFieldProps {
  field: FieldConfig;
  value: string;
  onChange: (name: string, value: string) => void;
  /** Override the DOM id — needed when the same field name repeats across
   * multiple rows (e.g. one per invoice/material line), so ids stay unique
   * and each <label> focuses the right instance. Defaults to `field-{name}`. */
  id?: string;
}

const inputClass =
  "w-full border border-black bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-black";

function normalizedOptions(field: FieldConfig): { value: string; label: string }[] {
  return (field.options ?? []).map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );
}

export function FormField({ field, value, onChange, id: idOverride }: FormFieldProps) {
  const id = idOverride ?? `field-${field.name}`;
  const safeValue = value ?? "";

  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-xs font-medium text-black">
        {field.label}
        {field.required && <span> *</span>}
      </label>

      {field.type === "select" ? (
        <select
          id={id}
          value={safeValue}
          required={field.required}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {normalizedOptions(field).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          value={safeValue}
          required={field.required}
          placeholder={field.placeholder}
          rows={3}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type={field.type}
          value={safeValue}
          readOnly={field.readOnly}
          required={field.required}
          placeholder={field.placeholder}
          step={field.step}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={`${inputClass}${field.readOnly ? " bg-white" : ""}`}
        />
      )}
    </div>
  );
}
