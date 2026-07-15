"use client";

interface FormSectionProps {
  title: string;
  description?: string;
  columns?: 2 | 3 | 4;
  children: React.ReactNode;
  /** For sections that create a linked record (Diesel Tank Fill / Vehicle
   * Maintenance) — a colored left border + light tint instead of the plain
   * white card, matching that category's color everywhere else in the app
   * (checkbox, button, Dashboard column). Replaces the old ad hoc
   * border-amber-500/border-blue-500 wrappers that Cargo and Infra each
   * applied inconsistently. */
  accent?: "diesel" | "maintenance";
}

const GRID_CLASS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 md:grid-cols-3",
  4: "sm:grid-cols-2 md:grid-cols-4",
};

const ACCENT_CLASS: Record<"diesel" | "maintenance", string> = {
  diesel: "border-l-4 border-l-diesel bg-diesel/5",
  maintenance: "border-l-4 border-l-maintenance bg-maintenance/5",
};

export function FormSection({
  title,
  description,
  columns = 2,
  children,
  accent,
}: FormSectionProps) {
  return (
    <section
      className={`rounded-lg border border-black/10 bg-white p-4 shadow-sm ${
        accent ? ACCENT_CLASS[accent] : ""
      }`}
    >
      <h3 className="text-sm font-semibold text-black">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-black">{description}</p>
      )}
      <div className={`mt-3 grid gap-x-3 gap-y-2.5 ${GRID_CLASS[columns]}`}>{children}</div>
    </section>
  );
}
