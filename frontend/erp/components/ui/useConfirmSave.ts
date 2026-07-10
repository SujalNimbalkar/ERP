"use client";

import { useCallback, useState } from "react";

type ToastState = { message: string; type: "success" | "error" } | null;

/**
 * Shared save flow: gate a save action behind a confirm dialog, then surface
 * the result as a dismissing toast. Used by every form that persists a record.
 */
export function useConfirmSave() {
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const requestConfirm = useCallback((action: () => void | Promise<void>) => {
    setPendingAction(() => action);
  }, []);

  const confirmSave = useCallback(async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) await action();
  }, [pendingAction]);

  const cancel = useCallback(() => setPendingAction(null), []);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    confirmOpen: pendingAction !== null,
    requestConfirm,
    confirmSave,
    cancel,
    toast,
    notify,
    dismissToast,
  };
}
