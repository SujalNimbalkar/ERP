"use client";

interface FormSectionProps {
  title: string;
  description?: string;
  columns?: 2 | 3 | 4;
  children: React.ReactNode;
}

const GRID_CLASS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 md:grid-cols-3",
  4: "sm:grid-cols-2 md:grid-cols-4",
};

export function FormSection({ title, description, columns = 2, children }: FormSectionProps) {
  return (
    <section className="border border-black p-3">
      <h3 className="text-sm font-semibold text-black">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-black">{description}</p>
      )}
      <div className={`mt-3 grid gap-x-3 gap-y-2.5 ${GRID_CLASS[columns]}`}>{children}</div>
    </section>
  );
}
