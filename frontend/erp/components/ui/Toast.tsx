"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = "success", duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${
        type === "error" ? "border-l-4 border-critical bg-white text-black" : "bg-brand text-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className={`shrink-0 text-xs underline ${type === "error" ? "text-black" : "text-white"}`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
