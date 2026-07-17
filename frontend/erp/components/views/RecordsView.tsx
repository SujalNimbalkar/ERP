"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteLocalRecord,
  findRecordsByDocumentNo,
  getLocalRecords,
  getLocalRecordsByType,
  updateLocalRecord,
} from "@/lib/localStore";
import { retrySync, submitToSheet, syncMasterRecord, uploadReceiptImage } from "@/lib/api";
import {
  buildTripExpenseRef,
  getRecordIdKey,
  parseFormData,
  recalcCargoRowAmounts,
  recalcInfraAmounts,
} from "@/lib/sheetConfig";
import { applyDieselCalc } from "@/lib/dieselUtils";
import { buildCargoReceiptDataFromRows, captureCargoReceipt } from "@/components/forms/CargoTripReceipt";
import {
  RECORD_VIEWS,
  downloadCsv,
  filterRecordsForView,
  getCellValue,
  recordSourceLabel,
  recordsToCsv,
  searchRecords,
} from "@/lib/recordColumns";
import { hasCloudSync, storageModeLabel } from "@/lib/storageMode";
import { fetchAuditLog } from "@/lib/sheetFetch";
import { appendAuditEntry, getAuditLog } from "@/lib/auditLog";
import type { AuditEntry } from "@/lib/auditLog";
import type { LocalRecord } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

const AUDIT_TAB = "__audit__";

/** Priority order of date-like field keys to filter on — the first one
 * present in a view's columns wins (most views use "date"; Salary doesn't
 * have one, so it falls back to "paymentDate"). */
const DATE_FILTER_CANDIDATES = ["date", "paymentDate", "scheduledSalaryDate"];

const PAGE_SIZES: (number | "all")[] = [50, 100, 200, "all"];

interface EditState {
  record: LocalRecord;
  draft: Record<string, string>;
}

function parseEditedData(draft: Record<string, string>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(draft)) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    result[key] = /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
  }
  return result;
}

/**
 * Re-derives calculated fields when editing a saved record, same formulas
 * the entry forms use — otherwise fixing a typo in, say, Rate silently
 * leaves Transport Amount stale. Each record type keeps its own formula set;
 * types with no such relationship (drivers, salary, ledger…) pass through
 * unchanged.
 */
function applyRecordFieldCalc(
  type: LocalRecord["type"],
  draft: Record<string, string>,
  changedField: string
): Record<string, string> {
  if (type === "cargo") return recalcCargoRowAmounts(draft, changedField);
  if (type === "infra") return recalcInfraAmounts(draft);
  if (type === "diesel") return applyDieselCalc(draft, changedField);
  return draft;
}

export function RecordsView() {
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [activeViewId, setActiveViewId] = useState(RECORD_VIEWS[0].id);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [syncFilter, setSyncFilter] = useState<"all" | "synced" | "pending">("all");
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const [pageSize, setPageSize] = useState<number | "all">(100);
  const [editing, setEditing] = useState<EditState | null>(null);
  // Cargo rows never carry Diesel Used/Toll+Overload directly (they live on
  // a linked Trip Expense record, one per trip) — this is only shown/used
  // when editing a cargo row that has no tripExpenseRef yet, letting a
  // missed value be added retroactively (see performSaveEdit).
  const [tripExpenseDraft, setTripExpenseDraft] = useState({
    dieselUsedThisTrip: "",
    tollOverloadAmount: "",
  });
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSource, setAuditSource] = useState<"loading" | "sheet" | "local">("local");
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  const isAuditTab = activeViewId === AUDIT_TAB;
  const activeView = RECORD_VIEWS.find((v) => v.id === activeViewId) ?? RECORD_VIEWS[0];

  function refresh() {
    setRecords(getLocalRecords());
  }

  // Shows the local recent cache instantly, then swaps in the full history
  // from the spreadsheet's Audit Log tab (local stays as offline fallback).
  function refreshAudit() {
    setAuditLog(getAuditLog());
    if (!hasCloudSync()) return;
    setAuditSource("loading");
    void fetchAuditLog().then((sheetEntries) => {
      if (sheetEntries) {
        setAuditLog(sheetEntries);
        setAuditSource("sheet");
      } else {
        setAuditSource("local");
      }
    });
  }

  useEffect(() => {
    refresh();
    // local audit cache only — the sheet history is fetched when the tab opens
    setAuditLog(getAuditLog());
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-local-update", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("sahyadri-local-update", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const viewRecords = useMemo(
    () => filterRecordsForView(records, activeView),
    [records, activeView]
  );

  const dateFilterKey = useMemo(
    () =>
      DATE_FILTER_CANDIDATES.find((k) => activeView.columns.some((c) => c.key === k)) ??
      null,
    [activeView]
  );
  const hasVehicleColumn = useMemo(
    () => activeView.columns.some((c) => c.key === "vehicleNo"),
    [activeView]
  );
  const hasDriverColumn = useMemo(
    () => activeView.columns.some((c) => c.key === "driverName"),
    [activeView]
  );

  const vehicleOptions = useMemo(() => {
    if (!hasVehicleColumn) return [];
    const set = new Set<string>();
    viewRecords.forEach((r) => {
      const v = String(r.data.vehicleNo ?? "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [viewRecords, hasVehicleColumn]);

  const driverOptions = useMemo(() => {
    if (!hasDriverColumn) return [];
    const set = new Set<string>();
    viewRecords.forEach((r) => {
      const v = String(r.data.driverName ?? "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [viewRecords, hasDriverColumn]);

  const hasActiveFilters =
    !!dateFrom || !!dateTo || !!vehicleFilter || !!driverFilter || syncFilter !== "all";

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setVehicleFilter("");
    setDriverFilter("");
    setSyncFilter("all");
  }

  const filteredRecords = useMemo(() => {
    if (isAuditTab) return [];
    let result = searchRecords(viewRecords, search);
    if (dateFilterKey && (dateFrom || dateTo)) {
      result = result.filter((r) => {
        const raw = String(r.data[dateFilterKey] ?? "");
        if (!raw) return false;
        if (dateFrom && raw < dateFrom) return false;
        if (dateTo && raw > dateTo) return false;
        return true;
      });
    }
    if (vehicleFilter) {
      result = result.filter((r) => String(r.data.vehicleNo ?? "") === vehicleFilter);
    }
    if (driverFilter) {
      result = result.filter((r) => String(r.data.driverName ?? "") === driverFilter);
    }
    if (syncFilter !== "all") {
      result = result.filter((r) =>
        syncFilter === "pending" ? r.synced === false : r.synced !== false
      );
    }
    // Sort by the view's date field when it has one; views with no date
    // column (e.g. Driver Master) fall back to when the record was saved.
    const sortValue = (r: LocalRecord) =>
      (dateFilterKey ? String(r.data[dateFilterKey] ?? "") : "") || r.savedAt;
    result = [...result].sort((a, b) => {
      const cmp = sortValue(a).localeCompare(sortValue(b));
      return dateSort === "newest" ? -cmp : cmp;
    });
    return result;
  }, [
    viewRecords,
    search,
    isAuditTab,
    dateFilterKey,
    dateFrom,
    dateTo,
    vehicleFilter,
    driverFilter,
    syncFilter,
    dateSort,
  ]);

  const visibleRecords = useMemo(
    () => (pageSize === "all" ? filteredRecords : filteredRecords.slice(0, pageSize)),
    [filteredRecords, pageSize]
  );

  const pendingRecords = useMemo(() => records.filter((r) => r.synced === false), [records]);

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditLog;
    return auditLog.filter((e) =>
      [e.action, e.recordType, e.recordId, e.documentNo ?? "", e.summary ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [auditLog, auditSearch]);

  const keyToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    activeView.columns
      .filter((c) => !c.key.startsWith("_"))
      .forEach((c) => { map[c.key] = c.label; });
    return map;
  }, [activeView]);

  const editFieldOrder = useMemo(() => {
    if (!editing) return [];
    const idKey = getRecordIdKey(editing.record.type);
    const viewKeys = activeView.columns
      .filter((c) => !c.key.startsWith("_") && c.key !== idKey)
      .map((c) => c.key)
      .filter((k) => k in editing.draft);
    const extra = Object.keys(editing.draft).filter(
      (k) => !viewKeys.includes(k) && k !== idKey
    );
    return [...viewKeys, ...extra];
  }, [editing, activeView]);

  function switchTab(id: string) {
    setActiveViewId(id);
    setSearch("");
    clearFilters();
    setEditing(null);
    if (id === AUDIT_TAB) refreshAudit();
  }

  function handleExportCsv() {
    if (filteredRecords.length === 0) return;
    const csv = recordsToCsv(filteredRecords, activeView.columns);
    downloadCsv(`sahyadri-${activeView.id}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function startEdit(record: LocalRecord) {
    setEditing({
      record,
      draft: Object.fromEntries(Object.entries(record.data).map(([k, v]) => [k, String(v)])),
    });
    setTripExpenseDraft({ dieselUsedThisTrip: "", tollOverloadAmount: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setTripExpenseDraft({ dieselUsedThisTrip: "", tollOverloadAmount: "" });
  }

  /**
   * Cargo-only follow-up to a saved edit: creates the trip's missing Trip
   * Expense record if the mini-editor was used (see the render below), then
   * regenerates and re-uploads the receipt image from every row sharing this
   * trip's documentNo (not just the one being edited) so the image — and
   * every sibling material-line row's receiptImageUrl — stays in sync.
   * Best-effort throughout: any failure here leaves the row's own edit
   * (already saved by the caller) intact, just without the extra updates.
   */
  async function syncCargoTripAfterEdit(
    editedRecord: LocalRecord,
    newData: Record<string, string | number>
  ): Promise<void> {
    const siblings = findRecordsByDocumentNo(String(newData.documentNo ?? ""), editedRecord.id).filter(
      (r) => r.type === "cargo"
    );

    let tripExpenseRef = String(newData.tripExpenseRef ?? "").trim();
    const hasNewTripExpense =
      !tripExpenseRef &&
      (Number(tripExpenseDraft.dieselUsedThisTrip) > 0 || Number(tripExpenseDraft.tollOverloadAmount) > 0);

    if (hasNewTripExpense) {
      tripExpenseRef = buildTripExpenseRef(String(newData.vehicleNo ?? ""), String(newData.date ?? ""));
      try {
        await submitToSheet({
          type: "trip-expense",
          data: parseFormData({
            id: tripExpenseRef,
            date: String(newData.date ?? ""),
            vehicleNo: String(newData.vehicleNo ?? ""),
            driverId: String(newData.driverId ?? ""),
            driverName: String(newData.driverName ?? ""),
            source: "cargo",
            documentNos: String(newData.documentNo ?? ""),
            ...tripExpenseDraft,
          }),
        });
        newData.tripExpenseRef = tripExpenseRef;
        for (const sibling of siblings) {
          const siblingData = { ...sibling.data, tripExpenseRef };
          updateLocalRecord(sibling.id, siblingData);
          void syncMasterRecord({ type: "cargo", action: "upsert", data: siblingData });
        }
      } catch (err) {
        console.warn("syncCargoTripAfterEdit: creating the Trip Expense record failed:", err);
        tripExpenseRef = "";
      }
    }

    const linkedExpense = tripExpenseRef
      ? getLocalRecordsByType("trip-expense").find((r) => String(r.data.id ?? "") === tripExpenseRef)
      : undefined;

    try {
      const receiptData = buildCargoReceiptDataFromRows([{ ...editedRecord, data: newData }, ...siblings], {
        dieselFillRef: String(newData.dieselFillRef ?? "") || undefined,
        dieselUsedThisTrip:
          tripExpenseDraft.dieselUsedThisTrip || String(linkedExpense?.data.dieselUsedThisTrip ?? "") || undefined,
        tollOverloadAmount:
          tripExpenseDraft.tollOverloadAmount || String(linkedExpense?.data.tollOverloadAmount ?? "") || undefined,
      });
      const dataUrl = await captureCargoReceipt(receiptData);
      const url = await uploadReceiptImage(
        dataUrl,
        `receipt-${newData.vehicleNo || "trip"}-${newData.date || Date.now()}.jpg`
      );
      if (url) {
        newData.receiptImageUrl = url;
        for (const sibling of siblings) {
          const siblingData = { ...sibling.data, receiptImageUrl: url };
          updateLocalRecord(sibling.id, siblingData);
          void syncMasterRecord({ type: "cargo", action: "upsert", data: siblingData });
        }
      }
    } catch (err) {
      console.warn("syncCargoTripAfterEdit: receipt regeneration failed:", err);
    }
  }

  async function performSaveEdit() {
    if (!editing) return;
    const newData = parseEditedData(editing.draft);

    if (editing.record.type === "cargo") {
      await syncCargoTripAfterEdit(editing.record, newData);
    }

    appendAuditEntry({
      action: "edit",
      recordId: editing.record.id,
      recordType: editing.record.type,
      before: editing.record.data,
      after: newData,
    });
    updateLocalRecord(editing.record.id, newData);

    // Legacy records saved before ID tracking have no id — skip the remote
    // upsert for them, since Code.gs would append a duplicate row instead of
    // updating in place when it can't match an existing one.
    const sheetId = newData[getRecordIdKey(editing.record.type)];
    if (sheetId !== undefined && sheetId !== "") {
      void syncMasterRecord({ type: editing.record.type, action: "upsert", data: newData });
    }

    setEditing(null);
    setTripExpenseDraft({ dieselUsedThisTrip: "", tollOverloadAmount: "" });
    refreshAudit();
    notify("Record updated.");
  }

  function saveEdit() {
    if (!editing) return;
    requestConfirm(performSaveEdit);
  }

  function handleDelete(record: LocalRecord) {
    const date = new Date(record.savedAt).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
    if (!confirm(`Delete this ${recordSourceLabel(record)} record (saved ${date})? This cannot be undone.`)) return;
    appendAuditEntry({
      action: "delete",
      recordId: record.id,
      recordType: record.type,
      before: record.data,
    });
    deleteLocalRecord(record.id);

    const sheetId = record.data[getRecordIdKey(record.type)];
    if (sheetId !== undefined && sheetId !== "") {
      void syncMasterRecord({ type: record.type, action: "delete", id: String(sheetId) });
    }

    if (editing?.record.id === record.id) setEditing(null);
    refreshAudit();
  }

  async function retryOne(record: LocalRecord) {
    setRetryingIds((prev) => new Set(prev).add(record.id));
    try {
      const ok = await retrySync(record);
      notify(ok ? "Synced to Google Sheets." : "Still can't reach Google Sheets — try again later.", ok ? "success" : "error");
      if (ok) refresh();
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  }

  async function retryAllPending() {
    const targets = pendingRecords;
    if (targets.length === 0) return;
    setBulkRetrying(true);
    try {
      const results = await Promise.all(targets.map((r) => retrySync(r)));
      const succeeded = results.filter(Boolean).length;
      notify(
        succeeded === targets.length
          ? `Synced ${succeeded} record(s) to Google Sheets.`
          : `Synced ${succeeded} of ${targets.length} — the rest are still unreachable.`,
        succeeded === targets.length ? "success" : "error"
      );
      refresh();
    } finally {
      setBulkRetrying(false);
    }
  }

  return (
    <div className="max-w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Saved Records</h2>
        <p className="mt-1 text-sm text-black">
          View saved entries in table form. Storage:{" "}
          <span className="font-semibold">{storageModeLabel()}</span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white p-1 shadow-sm">
        {RECORD_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => switchTab(view.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeViewId === view.id
                ? "bg-brand-tint font-semibold text-brand-text"
                : "font-normal text-black hover:bg-black/5"
            }`}
          >
            {view.label} ({filterRecordsForView(records, view).length})
          </button>
        ))}
        <button
          type="button"
          onClick={() => switchTab(AUDIT_TAB)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            isAuditTab
              ? "bg-brand-tint font-semibold text-brand-text"
              : "font-normal text-black hover:bg-black/5"
          }`}
        >
          Audit Log ({auditLog.length})
        </button>
      </div>

      {isAuditTab ? (
        <div>
          <input
            type="search"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Search by action, record type, invoice no…"
            className="mb-4 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          {filteredAudit.length === 0 ? (
            <p className="rounded-lg border border-black/10 bg-white px-4 py-6 text-sm text-black shadow-sm">
              {auditSearch
                ? `No audit entries matching "${auditSearch}".`
                : auditSource === "loading"
                  ? "Loading audit history from Google Sheets…"
                  : "No audit entries yet. Save, edit or delete a record to see entries here."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
              <table className="w-full border-collapse text-left text-sm text-black">
                <thead>
                  <tr className="border-b border-black/10 bg-page">
                    <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">Timestamp</th>
                    <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">Action</th>
                    <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">Record Type</th>
                    <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">Record ID</th>
                    <th className="px-3 py-2 text-xs font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((entry) => {
                    const changedFields =
                      entry.action === "edit"
                        ? Object.keys(entry.after ?? {}).filter(
                            (k) =>
                              String(entry.before[k] ?? "") !==
                              String((entry.after ?? {})[k] ?? "")
                          )
                        : [];
                    return (
                      <tr key={entry.id} className="border-b border-black/10 hover:bg-black/5">
                        <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs">
                          {new Date(entry.timestamp).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">
                          {entry.action.toUpperCase()}
                        </td>
                        <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs">
                          {entry.recordType}
                        </td>
                        <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-mono text-xs">
                          {entry.recordId.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {entry.summary ? (
                            <span title={changedFields.join(", ")} className="cursor-default">
                              {entry.summary}
                              {entry.documentNo ? (
                                <span className="text-black/50"> · {entry.documentNo}</span>
                              ) : null}
                            </span>
                          ) : entry.action === "delete" ? (
                            <span className="text-black/60">Record removed</span>
                          ) : (
                            <span
                              title={changedFields.join(", ")}
                              className="cursor-default"
                            >
                              {changedFields.length} field(s) changed
                              {changedFields.length > 0 && (
                                <span className="text-black/50"> · {changedFields.slice(0, 3).join(", ")}
                                  {changedFields.length > 3 ? `…` : ""}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-black">
            Showing {filteredAudit.length} of {auditLog.length} audit entries
            {auditSource === "sheet" && " · full history from Google Sheets"}
            {auditSource === "local" &&
              hasCloudSync() &&
              " · offline — recent entries from this device only"}
            {auditSource === "loading" && " · loading from Google Sheets…"}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice, vehicle, material, code…"
              className="min-w-55 flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRecords.length === 0}
              className="rounded-md border border-black/15 px-4 py-2 text-sm text-black transition-colors hover:bg-black/5 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={refresh}
              className="rounded-md border border-black/15 px-4 py-2 text-sm text-black transition-colors hover:bg-black/5"
            >
              Refresh
            </button>
            {hasCloudSync() && pendingRecords.length > 0 && (
              <button
                type="button"
                onClick={retryAllPending}
                disabled={bulkRetrying}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkRetrying ? "Syncing…" : `Sync Pending (${pendingRecords.length})`}
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            {dateFilterKey && (
              <>
                <label className="flex flex-col gap-0.5 text-xs text-black">
                  From
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-black">
                  To
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                  />
                </label>
              </>
            )}
            {hasVehicleColumn && (
              <label className="flex flex-col gap-0.5 text-xs text-black">
                Vehicle
                <select
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                  className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">All vehicles</option>
                  {vehicleOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            {hasDriverColumn && (
              <label className="flex flex-col gap-0.5 text-xs text-black">
                Driver
                <select
                  value={driverFilter}
                  onChange={(e) => setDriverFilter(e.target.value)}
                  className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">All drivers</option>
                  {driverOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            )}
            {hasCloudSync() && (
              <label className="flex flex-col gap-0.5 text-xs text-black">
                Sync status
                <select
                  value={syncFilter}
                  onChange={(e) => setSyncFilter(e.target.value as typeof syncFilter)}
                  className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                >
                  <option value="all">All</option>
                  <option value="synced">Synced</option>
                  <option value="pending">Pending</option>
                </select>
              </label>
            )}
            <label className="flex flex-col gap-0.5 text-xs text-black">
              Sort by date
              <select
                value={dateSort}
                onChange={(e) => setDateSort(e.target.value as typeof dateSort)}
                className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-black">
              Show
              <select
                value={pageSize}
                onChange={(e) =>
                  setPageSize(e.target.value === "all" ? "all" : Number(e.target.value))
                }
                className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size === "all" ? "All rows" : `${size} rows`}
                  </option>
                ))}
              </select>
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-2 py-1.5 text-xs text-brand-text underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {editing && (
            <div className="mb-4 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-black">
                  Editing — {recordSourceLabel(editing.record)} · saved{" "}
                  {new Date(editing.record.savedAt).toLocaleDateString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-md border border-black/15 px-4 py-1.5 text-sm text-black transition-colors hover:bg-black/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {editFieldOrder.map((key) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <label className="text-xs font-medium text-black">
                      {keyToLabel[key] ?? key}
                    </label>
                    <input
                      type="text"
                      value={editing.draft[key] ?? ""}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: applyRecordFieldCalc(
                                  prev.record.type,
                                  { ...prev.draft, [key]: e.target.value },
                                  key
                                ),
                              }
                            : prev
                        )
                      }
                      className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                    />
                  </div>
                ))}
              </div>

              {editing.record.type === "cargo" && !editing.draft.tripExpenseRef && (
                <div className="mt-3 rounded-md border border-l-4 border-black/10 border-l-diesel bg-diesel/5 p-3">
                  <p className="mb-2 text-xs font-semibold text-black">
                    Missed Diesel Used / Toll + Overload?
                  </p>
                  <p className="mb-2 text-xs text-black">
                    This trip has no linked Trip Expense record yet. Fill in either value and
                    save to create one — it will also regenerate this trip&apos;s receipt image.
                  </p>
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-medium text-black">
                        Diesel Used This Trip (Rs)
                      </label>
                      <input
                        type="number"
                        value={tripExpenseDraft.dieselUsedThisTrip}
                        onChange={(e) =>
                          setTripExpenseDraft((prev) => ({ ...prev, dieselUsedThisTrip: e.target.value }))
                        }
                        className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-medium text-black">Toll + Overload (Rs)</label>
                      <input
                        type="number"
                        value={tripExpenseDraft.tollOverloadAmount}
                        onChange={(e) =>
                          setTripExpenseDraft((prev) => ({ ...prev, tollOverloadAmount: e.target.value }))
                        }
                        className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredRecords.length === 0 ? (
            <p className="rounded-lg border border-black/10 bg-white px-4 py-6 text-sm text-black shadow-sm">
              No records for {activeView.label}
              {search ? ` matching "${search}"` : ""}
              {hasActiveFilters ? " matching the current filters" : ""}. Save entries from the
              form modules to see them here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
              <table className="w-full min-w-240 border-collapse text-left text-sm text-black">
                <thead>
                  <tr className="border-b border-black/10 bg-page">
                    <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">
                      Actions
                    </th>
                    {activeView.columns.map((col) => (
                      <th
                        key={col.key}
                        className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold last:border-r-0"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => {
                    const isEditingThis = editing?.record.id === record.id;
                    return (
                      <tr
                        key={record.id}
                        className={`border-b border-black/10 ${
                          isEditingThis ? "bg-brand-tint" : "hover:bg-black/5"
                        }`}
                      >
                        <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => (isEditingThis ? cancelEdit() : startEdit(record))}
                              className="text-brand-text underline"
                            >
                              {isEditingThis ? "Cancel" : "Edit"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              className="text-critical underline"
                            >
                              Delete
                            </button>
                            {hasCloudSync() && record.synced === false && (
                              <button
                                type="button"
                                onClick={() => retryOne(record)}
                                disabled={retryingIds.has(record.id)}
                                title="Sheet sync failed for this record — retry"
                                className="text-critical underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {retryingIds.has(record.id) ? "Syncing…" : "⚠ Retry Sync"}
                              </button>
                            )}
                          </div>
                        </td>
                        {activeView.columns.map((col) => {
                          const value = getCellValue(record, col.key);
                          const isUrl = /^https?:\/\//.test(value);
                          return (
                            <td
                              key={`${record.id}-${col.key}`}
                              className="max-w-55 truncate border-r border-black/10 px-3 py-2 text-xs last:border-r-0"
                              title={value || undefined}
                            >
                              {isUrl ? (
                                <a
                                  href={value}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-brand-text underline"
                                >
                                  {value}
                                </a>
                              ) : (
                                value || "—"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-black">
            Showing {visibleRecords.length} of {filteredRecords.length} row(s)
            {filteredRecords.length !== viewRecords.length && ` (${viewRecords.length} total)`} ·{" "}
            {activeView.columns.length} columns
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message="Save these changes to the record?"
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
