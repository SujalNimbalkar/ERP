"use client";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="border border-black p-4">
      <h3 className="text-sm font-semibold text-black">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-black">{description}</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
