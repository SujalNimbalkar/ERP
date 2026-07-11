"use client";

import { useEffect, useState } from "react";
import type { LocalRecord } from "@/lib/types";
import {
  clearLocalRecords,
  downloadLocalRecords,
  getLocalRecords,
} from "@/lib/localStore";
import { getLastSheetFetch, refreshFromSheets } from "@/lib/sheetFetch";
import { hasCloudSync, storageModeLabel } from "@/lib/storageMode";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LocalDataPanel() {
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState("");

  function refresh() {
    setRecords(getLocalRecords());
  }

  async function handleSheetRefresh() {
    setFetching(true);
    setFetchNote("");
    const result = await refreshFromSheets();
    setFetching(false);
    setFetchNote(result.message);
    refresh();
  }

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-local-update", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("sahyadri-local-update", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  function handleClear() {
    if (!confirm("Delete all locally saved records from this browser?")) return;
    clearLocalRecords();
    refresh();
  }

  if (!open) {
    return (
      <div className="border-t border-black p-3">
        <p className="text-xs text-black">
          Storage: <span className="font-semibold">{storageModeLabel()}</span>
        </p>
        <p className="mt-1 text-xs text-black">
          {hasCloudSync()
            ? `${records.length} record(s) from Google Sheets`
            : `${records.length} record(s) saved locally`}
        </p>
        {hasCloudSync() && (
          <>
            <button
              type="button"
              onClick={handleSheetRefresh}
              disabled={fetching}
              className="mt-2 w-full border border-black px-2 py-1.5 text-left text-xs font-semibold text-black disabled:opacity-50"
            >
              {fetching ? "Refreshing…" : "Refresh from Sheets"}
            </button>
            {(fetchNote || getLastSheetFetch()) && (
              <p className="mt-1 text-xs text-black">
                {fetchNote ||
                  `Last fetched ${formatDate(getLastSheetFetch() ?? "")}`}
              </p>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 w-full border border-black px-2 py-1.5 text-left text-xs text-black"
        >
          Export JSON (backup)
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-black px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-black">Local saved data</h2>
            <p className="text-sm text-black">
              {records.length} record(s) in this browser — export before clearing cache
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="border border-black px-4 py-2 text-sm text-black"
          >
            Close
          </button>
        </div>

        <div className="flex gap-2 border-b border-black px-6 py-3">
          <button
            type="button"
            onClick={downloadLocalRecords}
            disabled={records.length === 0}
            className="border border-black px-4 py-2 text-sm text-black disabled:opacity-50"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={records.length === 0}
            className="border border-black px-4 py-2 text-sm text-black disabled:opacity-50"
          >
            Clear all
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {records.length === 0 ? (
            <p className="text-sm text-black">No records yet. Submit a form to save locally.</p>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <div key={record.id} className="border border-black p-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-black">
                    <span className="font-semibold">{record.type}</span>
                    <span>{formatDate(record.savedAt)}</span>
                    <span className="text-xs">id: {record.id.slice(0, 8)}</span>
                  </div>
                  <pre className="mt-3 overflow-x-auto text-xs text-black">
                    {JSON.stringify(record.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
