"use client";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  deleteLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional third action (red) — e.g. discard the whole entry. */
  onDelete?: () => void;
  /** Optional review content (e.g. the filled form) shown above the buttons. */
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title = "Confirm Save",
  message,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  deleteLabel = "Delete",
  onConfirm,
  onCancel,
  onDelete,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={`flex w-full flex-col border border-black bg-white p-4 sm:p-5 ${
          children ? "max-w-2xl max-h-full" : "max-w-sm"
        }`}
      >
        <h3 id="confirm-dialog-title" className="text-base font-semibold text-black">
          {title}
        </h3>
        <p className="mt-1 text-sm text-black">{message}</p>

        {children && (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto border border-black p-3">
            {children}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-black bg-white px-4 py-2 text-sm text-black"
          >
            {cancelLabel}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="border border-red-700 bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              {deleteLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className="border border-green-800 bg-green-700 px-4 py-2 text-sm font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
