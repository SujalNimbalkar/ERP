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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={`flex w-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-xl sm:p-5 ${
          children ? "max-w-2xl max-h-full" : "max-w-sm"
        }`}
      >
        <h3 id="confirm-dialog-title" className="text-base font-semibold text-black">
          {title}
        </h3>
        <p className="mt-1 text-sm text-black">{message}</p>

        {children && (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md border border-black/10 p-3">
            {children}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm text-black transition-colors hover:bg-black/5"
          >
            {cancelLabel}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-critical px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-90"
            >
              {deleteLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
