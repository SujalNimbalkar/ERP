"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteLocalRecord, getLocalRecords, updateLocalRecord } from "@/lib/localStore";
import {
  RECORD_VIEWS,
  downloadCsv,
  filterRecordsForView,
  getCellValue,
  recordsToCsv,
  searchRecords,
} from "@/lib/recordColumns";
import { storageModeLabel } from "@/lib/storageMode";
import { appendAuditEntry, getAuditLog } from "@/lib/auditLog";
import type { AuditEntry } from "@/lib/auditLog";
import type { LocalRecord } from "@/lib/types";

const AUDIT_TAB = "__audit__";

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

export function RecordsView() {
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [activeViewId, setActiveViewId] = useState(RECORD_VIEWS[0].id);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState("");

  const isAuditTab = activeViewId === AUDIT_TAB;
  const activeView = RECORD_VIEWS.find((v) => v.id === activeViewId) ?? RECORD_VIEWS[0];

  function refresh() {
    setRecords(getLocalRecords());
  }

  function refreshAudit() {
    setAuditLog(getAuditLog());
  }

  useEffect(() => {
    refresh();
    refreshAudit();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-local-update", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("sahyadri-local-update", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const filteredRecords = useMemo(() => {
    if (isAuditTab) return [];
    return searchRecords(filterRecordsForView(records, activeView), search);
  }, [records, activeView, search, isAuditTab]);

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditLog;
    return auditLog.filter((e) =>
      [e.action, e.recordType, e.recordId].join(" ").toLowerCase().includes(q)
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
    const viewKeys = activeView.columns
      .filter((c) => !c.key.startsWith("_"))
      .map((c) => c.key)
      .filter((k) => k in editing.draft);
    const extra = Object.keys(editing.draft).filter((k) => !viewKeys.includes(k));
    return [...viewKeys, ...extra];
  }, [editing, activeView]);

  function switchTab(id: string) {
    setActiveViewId(id);
    setSearch("");
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
  }

  function cancelEdit() {
    setEditing(null);
  }

  function saveEdit() {
    if (!editing) return;
    const newData = parseEditedData(editing.draft);
    appendAuditEntry({
      action: "edit",
      recordId: editing.record.id,
      recordType: editing.record.type,
      before: editing.record.data,
      after: newData,
    });
    updateLocalRecord(editing.record.id, newData);
    setEditing(null);
    refreshAudit();
  }

  function handleDelete(record: LocalRecord) {
    const date = new Date(record.savedAt).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
    if (!confirm(`Delete this ${record.type} record (saved ${date})? This cannot be undone.`)) return;
    appendAuditEntry({
      action: "delete",
      recordId: record.id,
      recordType: record.type,
      before: record.data,
    });
    deleteLocalRecord(record.id);
    if (editing?.record.id === record.id) setEditing(null);
    refreshAudit();
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

      <div className="mb-4 flex flex-wrap gap-2 border-b border-black pb-3">
        {RECORD_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => switchTab(view.id)}
            className={`px-3 py-1.5 text-sm text-black ${
              activeViewId === view.id ? "font-semibold underline" : "font-normal"
            }`}
          >
            {view.label} ({filterRecordsForView(records, view).length})
          </button>
        ))}
        <button
          type="button"
          onClick={() => switchTab(AUDIT_TAB)}
          className={`px-3 py-1.5 text-sm text-black ${
            isAuditTab ? "font-semibold underline" : "font-normal"
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
            placeholder="Search by action, record type…"
            className="mb-4 w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none"
          />
          {filteredAudit.length === 0 ? (
            <p className="border border-black px-4 py-6 text-sm text-black">
              {auditSearch
                ? `No audit entries matching "${auditSearch}".`
                : "No audit entries yet. Edit or delete a record to see entries here."}
            </p>
          ) : (
            <div className="overflow-x-auto border border-black">
              <table className="w-full border-collapse text-left text-sm text-black">
                <thead>
                  <tr className="border-b border-black bg-white">
                    <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">Timestamp</th>
                    <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">Action</th>
                    <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">Record Type</th>
                    <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">Record ID</th>
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
                      <tr key={entry.id} className="border-b border-black/20 hover:bg-black/5">
                        <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-xs">
                          {new Date(entry.timestamp).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-xs font-semibold">
                          {entry.action.toUpperCase()}
                        </td>
                        <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-xs">
                          {entry.recordType}
                        </td>
                        <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 font-mono text-xs">
                          {entry.recordId.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {entry.action === "delete" ? (
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
              className="min-w-55 flex-1 border border-black bg-white px-3 py-2 text-sm text-black outline-none"
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRecords.length === 0}
              className="border border-black px-4 py-2 text-sm text-black disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={refresh}
              className="border border-black px-4 py-2 text-sm text-black"
            >
              Refresh
            </button>
          </div>

          {editing && (
            <div className="mb-4 border border-black p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-black">
                  Editing — {editing.record.type} · saved{" "}
                  {new Date(editing.record.savedAt).toLocaleDateString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="border border-black bg-white px-4 py-1.5 text-sm font-semibold text-black"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="border border-black px-4 py-1.5 text-sm text-black"
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
                            ? { ...prev, draft: { ...prev.draft, [key]: e.target.value } }
                            : prev
                        )
                      }
                      className="border border-black bg-white px-2 py-1 text-xs text-black outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredRecords.length === 0 ? (
            <p className="border border-black px-4 py-6 text-sm text-black">
              No records for {activeView.label}
              {search ? ` matching "${search}"` : ""}. Save entries from the form modules to see
              them here.
            </p>
          ) : (
            <div className="overflow-x-auto border border-black">
              <table className="w-full min-w-240 border-collapse text-left text-sm text-black">
                <thead>
                  <tr className="border-b border-black bg-white">
                    <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">
                      Actions
                    </th>
                    {activeView.columns.map((col) => (
                      <th
                        key={col.key}
                        className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold last:border-r-0"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const isEditingThis = editing?.record.id === record.id;
                    return (
                      <tr
                        key={record.id}
                        className={`border-b border-black/20 ${
                          isEditingThis ? "bg-black/5" : "hover:bg-black/5"
                        }`}
                      >
                        <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-xs">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => (isEditingThis ? cancelEdit() : startEdit(record))}
                              className="text-black underline"
                            >
                              {isEditingThis ? "Cancel" : "Edit"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              className="text-black underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                        {activeView.columns.map((col) => {
                          const value = getCellValue(record, col.key);
                          return (
                            <td
                              key={`${record.id}-${col.key}`}
                              className="max-w-55 truncate border-r border-black/20 px-3 py-2 text-xs last:border-r-0"
                              title={value || undefined}
                            >
                              {value || "—"}
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
            Showing {filteredRecords.length} row(s) · {activeView.columns.length} columns
          </p>
        </>
      )}
    </div>
  );
}
