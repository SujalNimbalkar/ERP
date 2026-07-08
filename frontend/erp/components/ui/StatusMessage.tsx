"use client";

interface StatusMessageProps {
  type: "success" | "error" | "idle";
  message: string;
}

export function StatusMessage({ type, message }: StatusMessageProps) {
  if (type === "idle" || !message) return null;

  return (
    <div
      className="border border-black bg-white px-4 py-3 text-sm text-black"
      role="alert"
    >
      {message}
    </div>
  );
}
