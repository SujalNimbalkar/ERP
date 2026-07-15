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
  "w-full rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30";

function normalizedOptions(field: FieldConfig): { value: string; label: string }[] {
  return (field.options ?? []).map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );
}

export function FormField({ field, value, onChange, id: idOverride }: FormFieldProps) {
  const id = idOverride ?? `field-${field.name}`;
  const safeValue = value ?? "";

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 pt-4">
        <input
          id={id}
          type="checkbox"
          checked={safeValue === "true"}
          onChange={(e) => onChange(field.name, e.target.checked ? "true" : "false")}
          className="h-4 w-4 rounded-sm border border-black/25 accent-brand"
        />
        <label htmlFor={id} className="text-xs font-medium text-black">
          {field.label}
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-xs font-medium text-black">
        {field.label}
        {field.required && <span className="text-brand-text"> *</span>}
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
