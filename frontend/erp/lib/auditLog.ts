import { syncMasterRecord } from "./api";

/**
 * Audit trail — every create/edit/delete lands here and is pushed to the
 * spreadsheet's "Audit Log" tab (full history). localStorage keeps only a
 * rolling recent cache for offline viewing.
 */

export interface AuditEntry {
  id: string;
  action: "create" | "edit" | "delete";
  recordId: string;
  recordType: string;
  timestamp: string;
  /** Invoice / DC / document number when the record has one — eases searching */
  documentNo?: string;
  /** One-line human description of what happened */
  summary?: string;
  before: Record<string, string | number>;
  after?: Record<string, string | number>;
}

const AUDIT_KEY = "sahyadri_audit_log";
const MAX_ENTRIES = 1000;

function readLog(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditEntry[];
  } catch {
    return [];
  }
}

export function getAuditLog(): AuditEntry[] {
  return readLog();
}

/** Flat one-row shape for the Sheet's Audit Log tab. */
function auditSheetRow(entry: AuditEntry): Record<string, unknown> {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    recordType: entry.recordType,
    recordId: entry.recordId,
    documentNo: entry.documentNo ?? "",
    summary: entry.summary ?? "",
    beforeJson: Object.keys(entry.before).length > 0 ? JSON.stringify(entry.before) : "",
    afterJson: entry.after ? JSON.stringify(entry.after) : "",
  };
}

export function appendAuditEntry(
  entry: Omit<AuditEntry, "id" | "timestamp">
): AuditEntry {
  const full: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const log = readLog();
  log.unshift(full);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, MAX_ENTRIES)));
  // upsert-by-id: safe against duplicates if a retry ever re-sends the entry
  void syncMasterRecord({ type: "audit", action: "upsert", data: auditSheetRow(full) });
  return full;
}

export function clearAuditLog() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUDIT_KEY);
  }
}
