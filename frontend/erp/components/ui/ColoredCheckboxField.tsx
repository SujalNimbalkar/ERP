"use client";

interface ColoredCheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Matches the Dashboard's category color for the linked record this
   * checkbox creates (Diesel = blue, Maintenance = amber) — same category,
   * same color, everywhere in the app. The label stays plain ink; the dot
   * and checkbox accent carry the color, per the "text never wears the
   * series color" rule. */
  category: "diesel" | "maintenance";
}

const CATEGORY_COLOR: Record<ColoredCheckboxFieldProps["category"], string> = {
  diesel: "var(--color-diesel)",
  maintenance: "var(--color-maintenance)",
};

export function ColoredCheckboxField({
  id,
  label,
  checked,
  onChange,
  category,
}: ColoredCheckboxFieldProps) {
  const color = CATEGORY_COLOR[category];
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded-sm border border-black/25"
        style={{ accentColor: color }}
      />
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <label htmlFor={id} className="text-xs font-semibold text-black">
        {label}
      </label>
    </div>
  );
}
