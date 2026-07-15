"use client";

import { useEffect, useState } from "react";
import {
  STAFF_ROLES,
  deleteStaff,
  getAllStaff,
  getNextStaffId,
  saveStaff,
  updateStaff,
  type StaffRecord,
} from "@/lib/staffStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

const TABS = [
  { id: "browse", label: "Browse" },
  { id: "add", label: "Add Staff" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputClass =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30";
const cellInputClass =
  "w-full rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30";

interface EditState {
  id: string;
  name: string;
  role: string;
  mobileNumber: string;
  rate: string;
  notes: string;
}

function blankNew(): Omit<StaffRecord, "id" | "addedAt" | "updatedAt"> {
  return { name: "", role: STAFF_ROLES[0], mobileNumber: "", rate: "", notes: "" };
}

export function StaffMasterModule() {
  const [activeTab, setActiveTab] = useState<TabId>("browse");
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editError, setEditError] = useState("");

  const [form, setForm] = useState(blankNew());
  const [saveStatus, setSaveStatus] = useState<"idle" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  function refresh() {
    setStaff(getAllStaff());
  }

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-staff-update", onUpdate);
    return () => window.removeEventListener("sahyadri-staff-update", onUpdate);
  }, []);

  const filtered = staff.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q);
  });

  function startEdit(s: StaffRecord) {
    setEditing({
      id: s.id,
      name: s.name,
      role: s.role,
      mobileNumber: s.mobileNumber,
      rate: s.rate,
      notes: s.notes,
    });
    setEditError("");
  }

  function cancelEdit() {
    setEditing(null);
    setEditError("");
  }

  function handleSaveEdit() {
    if (!editing) return;
    const trimName = editing.name.trim();
    if (!trimName) {
      setEditError("Name is required.");
      return;
    }
    requestConfirm(() => performSaveEdit(editing, trimName));
  }

  function performSaveEdit(current: EditState, trimName: string) {
    updateStaff(current.id, {
      name: trimName,
      role: current.role,
      mobileNumber: current.mobileNumber.trim(),
      rate: current.rate.trim(),
      notes: current.notes.trim(),
    });
    setEditing(null);
    setEditError("");
    refresh();
    notify(`Staff "${trimName}" updated.`);
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove staff "${name}"?`)) return;
    deleteStaff(id);
    refresh();
  }

  function performAdd(trimName: string) {
    const record: StaffRecord = {
      id: getNextStaffId(),
      name: trimName,
      role: form.role,
      mobileNumber: form.mobileNumber.trim(),
      rate: form.rate.trim(),
      notes: form.notes.trim(),
      addedAt: new Date().toISOString(),
      updatedAt: "",
    };
    saveStaff(record);
    setForm(blankNew());
    refresh();
    notify(`Staff "${trimName}" (${record.id}) added.`);
  }

  function handleAdd(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimName = form.name.trim();
    if (!trimName) {
      setSaveStatus("error");
      setSaveMsg("Name is required.");
      return;
    }
    setSaveStatus("idle");
    setSaveMsg("");
    requestConfirm(() => performAdd(trimName));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Staff Master</h2>
        <p className="mt-1 text-sm text-black">
          Accountants, hamals and other non-driver staff. {staff.length} on file. Used by
          Payroll's Salary and Daily Expenses forms.
        </p>
        <div className="mt-4 flex flex-wrap rounded-lg border border-black/10 bg-white p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSaveStatus("idle");
                setSaveMsg("");
              }}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-tint font-semibold text-brand-text"
                  : "font-normal text-black hover:bg-black/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "browse" && (
        <div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or role…"
            className="mb-4 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
          />

          <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
            <table className="w-full border-collapse text-left text-sm text-black">
              <thead>
                <tr className="border-b border-black/10 bg-page">
                  <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    ID
                  </th>
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Name
                  </th>
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Role
                  </th>
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Mobile
                  </th>
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Rate (Rs)
                  </th>
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Notes
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-sm text-black">
                      {staff.length === 0
                        ? "No staff added yet."
                        : `No staff match “${search}”.`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const isEditingThis = editing?.id === s.id;
                    if (isEditingThis && editing) {
                      return (
                        <tr key={s.id} className="border-b border-black/10 bg-brand-tint">
                          <td className="border-r border-black/10 px-2 py-1.5 font-mono text-xs">
                            {s.id}
                          </td>
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <input
                              type="text"
                              value={editing.name}
                              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                              className={cellInputClass}
                            />
                          </td>
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <select
                              value={editing.role}
                              onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                              className={cellInputClass}
                            >
                              {STAFF_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <input
                              type="text"
                              value={editing.mobileNumber}
                              onChange={(e) =>
                                setEditing({ ...editing, mobileNumber: e.target.value })
                              }
                              className={cellInputClass}
                            />
                          </td>
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <input
                              type="number"
                              step="0.01"
                              value={editing.rate}
                              onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                              className={cellInputClass}
                            />
                          </td>
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <input
                              type="text"
                              value={editing.notes}
                              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                              className={cellInputClass}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                className="font-semibold text-brand-text underline"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="text-black underline"
                              >
                                Cancel
                              </button>
                            </div>
                            {editError && <p className="mt-1 text-critical">{editError}</p>}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={s.id} className="border-b border-black/10 hover:bg-black/5">
                        <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-xs font-mono">
                          {s.id}
                        </td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">{s.name}</td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">{s.role}</td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">
                          {s.mobileNumber || "—"}
                        </td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">
                          {s.rate ? `Rs ${s.rate}` : "—"}
                        </td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">
                          {s.notes || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              className="text-brand-text underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(s.id, s.name)}
                              className="text-critical underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-black">
            Showing {filtered.length} of {staff.length} staff
          </p>
        </div>
      )}

      {activeTab === "add" && (
        <form onSubmit={handleAdd} className="max-w-lg space-y-4">
          <div className="space-y-4 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-black">New Staff</h3>

            <div className="flex flex-col gap-1">
              <label htmlFor="staff-name" className="text-sm font-medium text-black">
                Name <span>*</span>
              </label>
              <input
                id="staff-name"
                type="text"
                value={form.name}
                required
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setSaveStatus("idle");
                }}
                placeholder="e.g. Ramesh Kulkarni"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="staff-role" className="text-sm font-medium text-black">
                Role
              </label>
              <select
                id="staff-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={inputClass}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="staff-mobile" className="text-sm font-medium text-black">
                Mobile Number
              </label>
              <input
                id="staff-mobile"
                type="text"
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                placeholder="10-digit mobile number"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="staff-rate" className="text-sm font-medium text-black">
                Salary (Rs)
              </label>
              <input
                id="staff-rate"
                type="number"
                // step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="e.g. 25000"
                className={inputClass}
              />
              <p className="text-xs text-black/60">
                Monthly salary for Accountant, daily wage for Hamal — auto-fills the amount
                in Payroll &gt; Salary.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="staff-notes" className="text-sm font-medium text-black">
                Notes (optional)
              </label>
              <textarea
                id="staff-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass}
                rows={2}
              />
            </div>
          </div>

          {saveStatus === "error" && (
            <p className="rounded-md border-l-4 border-critical bg-critical-tint px-4 py-2 text-sm text-black">{saveMsg}</p>
          )}

          <button
            type="submit"
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Add Staff
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message={editing ? "Update this staff member?" : "Add this staff member?"}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}
