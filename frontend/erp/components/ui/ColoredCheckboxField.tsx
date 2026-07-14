"use client";

interface ColoredCheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Diesel-linked checkboxes are amber (fuel), maintenance-linked ones are blue (service) —
   * the app is otherwise strictly black/white, so this is deliberate emphasis. */
  color: "amber" | "blue";
}

const COLOR_CLASSES: Record<ColoredCheckboxFieldProps["color"], { input: string; label: string }> = {
  amber: { input: "accent-amber-500", label: "text-amber-700" },
  blue: { input: "accent-blue-600", label: "text-blue-700" },
};

export function ColoredCheckboxField({ id, label, checked, onChange, color }: ColoredCheckboxFieldProps) {
  const classes = COLOR_CLASSES[color];
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`h-4 w-4 border border-black ${classes.input}`}
      />
      <label htmlFor={id} className={`text-xs font-semibold ${classes.label}`}>
        {label}
      </label>
    </div>
  );
}
