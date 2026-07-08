"use client";

import type { FieldConfig } from "@/lib/types";

interface FormFieldProps {
  field: FieldConfig;
  value: string;
  onChange: (name: string, value: string) => void;
}

const inputClass =
  "w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:border-black";

export function FormField({ field, value, onChange }: FormFieldProps) {
  const id = `field-${field.name}`;
  const safeValue = value ?? "";

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-black">
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
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
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
          onChange={(e) => onChange(field.name, e.target.value)}
          className={`${inputClass}${field.readOnly ? " bg-white" : ""}`}
        />
      )}
    </div>
  );
}
