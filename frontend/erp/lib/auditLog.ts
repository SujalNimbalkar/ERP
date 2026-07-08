export interface AuditEntry {
  id: string;
  action: "edit" | "delete";
  recordId: string;
  recordType: string;
  timestamp: string;
  before: Record<string, string | number>;
  after?: Record<string, string | number>;
}

const AUDIT_KEY = "sahyadri_audit_log";
const MAX_ENTRIES = 500;

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
  return full;
}

export function clearAuditLog() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUDIT_KEY);
  }
}
