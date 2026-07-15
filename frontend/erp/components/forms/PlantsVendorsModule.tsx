"use client";

import { useEffect, useState } from "react";
import {
  deleteLocation,
  getAllLocations,
  saveLocation,
  updateLocation,
  type LocationEntry,
} from "@/lib/locationStore";
import { BUILT_IN_CARGO_SOURCES } from "@/lib/sheetConfig";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

const TABS = [
  { id: "browse", label: "Browse" },
  { id: "add", label: "Add" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputClass =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30";
const cellInputClass =
  "w-full rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30";

interface DisplayRow {
  key: string;
  name: string;
  isBuiltIn: boolean;
  isCargoPlant: boolean;
  notes: string;
  location?: LocationEntry;
}

interface EditState {
  id: string;
  name: string;
  isCargoPlant: boolean;
  notes: string;
}

function blankForm() {
  return { name: "", isCargoPlant: false, notes: "" };
}

export function PlantsVendorsModule() {
  const [activeTab, setActiveTab] = useState<TabId>("browse");
  const [locations, setLocations] = useState<LocationEntry[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editError, setEditError] = useState("");

  const [form, setForm] = useState(blankForm());
  const [saveStatus, setSaveStatus] = useState<"idle" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  function refresh() {
    setLocations(getAllLocations());
  }

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-location-update", onUpdate);
    return () => window.removeEventListener("sahyadri-location-update", onUpdate);
  }, []);

  const rows: DisplayRow[] = [
    ...BUILT_IN_CARGO_SOURCES.map((s) => ({
      key: s.type,
      name: s.label,
      isBuiltIn: true,
      isCargoPlant: true,
      notes: "",
    })),
    ...locations.map((l) => ({
      key: l.id,
      name: l.name,
      isBuiltIn: false,
      isCargoPlant: l.isCargoPlant,
      notes: l.notes,
      location: l,
    })),
  ];

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q);
  });

  function startEdit(location: LocationEntry) {
    setEditing({
      id: location.id,
      name: location.name,
      isCargoPlant: location.isCargoPlant,
      notes: location.notes,
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
    updateLocation(current.id, {
      name: trimName,
      isCargoPlant: current.isCargoPlant,
      notes: current.notes.trim(),
    });
    setEditing(null);
    setEditError("");
    refresh();
    notify(`"${trimName}" updated.`);
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}"?`)) return;
    deleteLocation(id);
    refresh();
  }

  function performAdd(trimName: string) {
    saveLocation({
      id: `loc-${Date.now()}`,
      name: trimName,
      isCargoPlant: form.isCargoPlant,
      notes: form.notes.trim(),
    });
    setForm(blankForm());
    refresh();
    notify(
      form.isCargoPlant
        ? `"${trimName}" added — it now appears as a Cargo Transport source.`
        : `"${trimName}" added as a delivery vendor.`
    );
  }

  function handleAdd(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimName = form.name.trim();
    if (!trimName) {
      setSaveStatus("error");
      setSaveMsg("Name is required.");
      return;
    }
    if (rows.some((r) => r.name.toLowerCase() === trimName.toLowerCase())) {
      setSaveStatus("error");
      setSaveMsg(`"${trimName}" already exists.`);
      return;
    }
    setSaveStatus("idle");
    setSaveMsg("");
    requestConfirm(() => performAdd(trimName));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Plants & Vendors</h2>
        <p className="mt-1 text-sm text-black">
          One list of places. Check &ldquo;Cargo Plant&rdquo; on any entry to give it its
          own origin tab-bar button in Cargo Transport — leave it unchecked for a
          destination-only vendor. Flip it later without re-entering the place.
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
            placeholder="Search by name…"
            className="mb-4 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
          />

          <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
            <table className="w-full border-collapse text-left text-sm text-black">
              <thead>
                <tr className="border-b border-black/10 bg-page">
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Name
                  </th>
                  <th className="border-r border-black/10 px-3 py-2 text-xs font-semibold">
                    Type
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
                    <td colSpan={4} className="px-3 py-6 text-sm text-black">
                      {rows.length === 0 ? "Nothing added yet." : `No matches for “${search}”.`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const isEditingThis = row.location && editing?.id === row.location.id;
                    if (isEditingThis && editing) {
                      return (
                        <tr key={row.key} className="border-b border-black/10 bg-brand-tint">
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <input
                              type="text"
                              value={editing.name}
                              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                              className={cellInputClass}
                            />
                          </td>
                          <td className="border-r border-black/10 px-2 py-1.5">
                            <label className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={editing.isCargoPlant}
                                onChange={(e) =>
                                  setEditing({ ...editing, isCargoPlant: e.target.checked })
                                }
                              />
                              Cargo Plant
                            </label>
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
                      <tr key={row.key} className="border-b border-black/10 hover:bg-black/5">
                        <td className="border-r border-black/10 px-3 py-2 text-xs">{row.name}</td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">
                          {row.isBuiltIn ? (
                            <span className="text-black/50">Built-in Plant</span>
                          ) : row.isCargoPlant ? (
                            <span className="font-medium">Cargo Plant</span>
                          ) : (
                            <span>Vendor</span>
                          )}
                        </td>
                        <td className="border-r border-black/10 px-3 py-2 text-xs">
                          {row.notes || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.location && (
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => startEdit(row.location as LocationEntry)}
                                className="text-brand-text underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete((row.location as LocationEntry).id, row.name)
                                }
                                className="text-critical underline"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-black">
            Showing {filtered.length} of {rows.length}
          </p>
        </div>
      )}

      {activeTab === "add" && (
        <form onSubmit={handleAdd} className="max-w-lg space-y-4">
          <div className="space-y-4 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-black">New Place</h3>

            <div className="flex flex-col gap-1">
              <label htmlFor="loc-name" className="text-sm font-medium text-black">
                Name <span>*</span>
              </label>
              <input
                id="loc-name"
                type="text"
                value={form.name}
                required
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setSaveStatus("idle");
                }}
                placeholder="e.g. New Foundry - Satara, ABC Traders"
                className={inputClass}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-black">
              <input
                type="checkbox"
                checked={form.isCargoPlant}
                onChange={(e) => setForm({ ...form, isCargoPlant: e.target.checked })}
              />
              Also use as a Cargo Plant (origin)
            </label>
            <p className="-mt-2 text-xs text-black/60">
              Checked: shows as a tab-bar button in Cargo Transport, and as a
              &ldquo;To&rdquo; option on every other plant — no Google Sheet setup
              needed. Unchecked: destination-only, still available as a &ldquo;To&rdquo;
              option everywhere.
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="loc-notes" className="text-sm font-medium text-black">
                Notes (optional)
              </label>
              <textarea
                id="loc-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. address, contact person"
                className={inputClass}
                rows={3}
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
            Add
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message={editing ? "Update this place?" : "Add this place?"}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}
