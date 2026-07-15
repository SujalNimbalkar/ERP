"use client";

interface StatusMessageProps {
  type: "success" | "error" | "idle";
  message: string;
}

const TYPE_CLASS: Record<"success" | "error", string> = {
  success: "border-l-4 border-good bg-good-tint text-black",
  error: "border-l-4 border-critical bg-critical-tint text-black",
};

export function StatusMessage({ type, message }: StatusMessageProps) {
  if (type === "idle" || !message) return null;

  return (
    <div
      className={`rounded-md px-4 py-3 text-sm ${TYPE_CLASS[type]}`}
      role="alert"
    >
      {message}
    </div>
  );
}
