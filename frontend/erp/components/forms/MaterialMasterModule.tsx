"use client";

import React, { useEffect, useState } from "react";
import {
  MATERIAL_MASTER,
  type MaterialMasterEntry,
} from "@/lib/materialMaster";
import {
  deleteCustomMaterial,
  getAllMaterials,
  getCustomMaterials,
  saveCustomMaterial,
  type CustomMaterialEntry,
} from "@/lib/materialStore";

const TABS = [
  { id: "browse", label: "Browse All" },
  { id: "add", label: "Add Material" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isCustom(
  entry: MaterialMasterEntry | CustomMaterialEntry
): entry is CustomMaterialEntry {
  return "isCustom" in entry && entry.isCustom === true;
}

const inputClass =
  "w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:border-black";

interface EditState {
  id: string;
  code: string;
  name: string;
  weight: string;
  ratePerKg: string;
  isBuiltIn: boolean;
}

export function MaterialMasterModule() {
  const [activeTab, setActiveTab] = useState<TabId>("browse");
  const [materials, setMaterials] = useState<
    (MaterialMasterEntry | CustomMaterialEntry)[]
  >([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editError, setEditError] = useState("");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [ratePerKg, setRatePerKg] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");

  function refresh() {
    setMaterials(getAllMaterials());
  }

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-material-update", onUpdate);
    return () => window.removeEventListener("sahyadri-material-update", onUpdate);
  }, []);

  const filtered = materials.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q)
    );
  });

  const builtInCount = MATERIAL_MASTER.length;
  const customCount = getCustomMaterials().length;

  function startEdit(m: MaterialMasterEntry | CustomMaterialEntry) {
    setEditing({
      id: m.id,
      code: m.code,
      name: m.name,
      weight: m.weightPerPieceKg != null ? String(m.weightPerPieceKg) : "",
      ratePerKg: m.ratePerKg != null ? String(m.ratePerKg) : "",
      isBuiltIn: !isCustom(m),
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
    const trimCode = editing.code.trim();

    if (!trimCode || !trimName) {
      setEditError("Code and Name are required.");
      return;
    }

    const weightNum = editing.weight.trim() ? Number(editing.weight.trim()) : undefined;
    const rateNum = editing.ratePerKg.trim() ? Number(editing.ratePerKg.trim()) : undefined;

    if (editing.isBuiltIn) {
      // Save as a custom override — same code shadows the built-in via findMaterialByCodeAll
      saveCustomMaterial({
        id: `custom-${trimCode}-${Date.now()}`,
        code: trimCode,
        name: trimName,
        weightPerPieceKg: weightNum && weightNum > 0 ? weightNum : undefined,
        ratePerKg: rateNum && rateNum > 0 ? rateNum : undefined,
      });
    } else {
      // Update existing custom entry in place
      saveCustomMaterial({
        id: editing.id,
        code: trimCode,
        name: trimName,
        weightPerPieceKg: weightNum && weightNum > 0 ? weightNum : undefined,
        ratePerKg: rateNum && rateNum > 0 ? rateNum : undefined,
      });
    }

    setEditing(null);
    setEditError("");
    refresh();
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this custom material from the master list?")) return;
    deleteCustomMaterial(id);
    refresh();
  }

  function handleAdd(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimCode = code.trim();
    const trimName = name.trim();

    if (!trimCode || !trimName) {
      setSaveStatus("error");
      setSaveMsg("Code and Name are required.");
      return;
    }

    const duplicate = materials.find(
      (m) => m.code === trimCode && !isCustom(m)
    );
    if (duplicate) {
      setSaveStatus("error");
      setSaveMsg(
        `Code "${trimCode}" already exists as a built-in material (${duplicate.name}). Use a different code.`
      );
      return;
    }

    const weightNum = weight.trim() ? Number(weight.trim()) : undefined;
    const rateNum = ratePerKg.trim() ? Number(ratePerKg.trim()) : undefined;
    saveCustomMaterial({
      id: `custom-${trimCode}-${Date.now()}`,
      code: trimCode,
      name: trimName,
      weightPerPieceKg: weightNum && weightNum > 0 ? weightNum : undefined,
      ratePerKg: rateNum && rateNum > 0 ? rateNum : undefined,
    });

    setCode("");
    setName("");
    setWeight("");
    setRatePerKg("");
    setSaveStatus("success");
    setSaveMsg(`Material "${trimName}" (${trimCode}) added to master list.`);
    refresh();
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Material Master</h2>
        <p className="mt-1 text-sm text-black">
          {builtInCount} built-in materials · {customCount} custom
          {customCount > 0 ? " (stored in this browser)" : ""}. Custom materials
          auto-fill in the Cargo form by code.
        </p>
        <div className="mt-4 flex flex-wrap border border-black">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSaveStatus("idle");
                setSaveMsg("");
              }}
              className={`px-3 py-1.5 text-sm text-black ${
                activeTab === tab.id ? "font-semibold underline" : "font-normal"
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
            placeholder="Search by code or name…"
            className="mb-4 w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none"
          />

          <div className="overflow-x-auto border border-black">
            <table className="w-full border-collapse text-left text-sm text-black">
              <thead>
                <tr className="border-b border-black bg-white">
                  <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">
                    Code
                  </th>
                  <th className="border-r border-black/30 px-3 py-2 text-xs font-semibold">
                    Material Name
                  </th>
                  <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">
                    Per Piece Wt (kg)
                  </th>
                  <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">
                    Rate (Rs/kg)
                  </th>
                  <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 text-xs font-semibold">
                    Source
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-sm text-black">
                      No materials match &ldquo;{search}&rdquo;.
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const isEditingThis = editing?.id === m.id;

                    if (isEditingThis && editing) {
                      return (
                        <React.Fragment key={m.id}>
                          <tr className="border-b border-black bg-black/5">
                            <td className="border-r border-black/20 px-2 py-1.5">
                              <input
                                type="text"
                                value={editing.code}
                                disabled={editing.isBuiltIn}
                                onChange={(e) =>
                                  setEditing({ ...editing, code: e.target.value })
                                }
                                className="w-full border border-black bg-white px-2 py-1 font-mono text-xs text-black outline-none disabled:opacity-50"
                              />
                            </td>
                            <td className="border-r border-black/20 px-2 py-1.5">
                              <input
                                type="text"
                                value={editing.name}
                                onChange={(e) =>
                                  setEditing({ ...editing, name: e.target.value })
                                }
                                className="w-full border border-black bg-white px-2 py-1 text-xs text-black outline-none"
                              />
                            </td>
                            <td className="border-r border-black/20 px-2 py-1.5">
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={editing.weight}
                                onChange={(e) =>
                                  setEditing({ ...editing, weight: e.target.value })
                                }
                                className="w-full border border-black bg-white px-2 py-1 text-xs text-black outline-none"
                              />
                            </td>
                            <td className="border-r border-black/20 px-2 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editing.ratePerKg}
                                onChange={(e) =>
                                  setEditing({ ...editing, ratePerKg: e.target.value })
                                }
                                className="w-full border border-black bg-white px-2 py-1 text-xs text-black outline-none"
                              />
                            </td>
                            <td className="border-r border-black/20 px-3 py-1.5 text-xs">
                              {editing.isBuiltIn ? (
                                <span className="text-black/50">Built-in override</span>
                              ) : (
                                <span className="font-medium">Custom</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveEdit}
                                  className="font-semibold text-black underline"
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
                            </td>
                          </tr>
                          {editError && (
                            <tr key={`${m.id}-err`}>
                              <td
                                colSpan={6}
                                className="border-b border-black/20 bg-black/5 px-3 py-1.5 text-xs text-black"
                              >
                                {editError}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    }

                    return (
                      <tr
                        key={m.id}
                        className="border-b border-black/20 hover:bg-black/5"
                      >
                        <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-xs font-mono">
                          {m.code}
                        </td>
                        <td className="border-r border-black/20 px-3 py-2 text-xs">
                          {m.name}
                        </td>
                        <td className="border-r border-black/20 px-3 py-2 text-xs">
                          {m.weightPerPieceKg != null ? m.weightPerPieceKg : "—"}
                        </td>
                        <td className="border-r border-black/20 px-3 py-2 text-xs">
                          {m.ratePerKg != null ? `Rs ${m.ratePerKg}` : "—"}
                        </td>
                        <td className="border-r border-black/20 px-3 py-2 text-xs">
                          {isCustom(m) ? (
                            <span className="font-medium">Custom</span>
                          ) : (
                            <span className="text-black/50">Built-in</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => startEdit(m)}
                              className="text-black underline"
                            >
                              Edit
                            </button>
                            {isCustom(m) && (
                              <button
                                type="button"
                                onClick={() => handleDelete(m.id)}
                                className="text-black underline"
                              >
                                Delete
                              </button>
                            )}
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
            Showing {filtered.length} of {materials.length} materials
          </p>
        </div>
      )}

      {activeTab === "add" && (
        <form onSubmit={handleAdd} className="max-w-lg space-y-4">
          <div className="border border-black p-4 space-y-4">
            <h3 className="text-sm font-semibold text-black">New Material</h3>

            <div className="flex flex-col gap-1">
              <label htmlFor="mat-code" className="text-sm font-medium text-black">
                Material Code <span>*</span>
              </label>
              <input
                id="mat-code"
                type="text"
                value={code}
                required
                onChange={(e) => {
                  setCode(e.target.value);
                  setSaveStatus("idle");
                }}
                placeholder="e.g. 7001999"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="mat-name" className="text-sm font-medium text-black">
                Material Name <span>*</span>
              </label>
              <input
                id="mat-name"
                type="text"
                value={name}
                required
                onChange={(e) => {
                  setName(e.target.value);
                  setSaveStatus("idle");
                }}
                placeholder="e.g. Cylinder Block XYZ"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="mat-weight" className="text-sm font-medium text-black">
                Per Piece Weight (kg)
              </label>
              <input
                id="mat-weight"
                type="number"
                step="0.001"
                min="0"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setSaveStatus("idle");
                }}
                placeholder="Leave blank if not applicable"
                className={inputClass}
              />
              <p className="text-xs text-black/60">
                Used to auto-calculate total trip weight in Cargo form.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="mat-rate" className="text-sm font-medium text-black">
                Transport Rate (Rs/kg)
              </label>
              <input
                id="mat-rate"
                type="number"
                step="0.01"
                min="0"
                value={ratePerKg}
                onChange={(e) => {
                  setRatePerKg(e.target.value);
                  setSaveStatus("idle");
                }}
                placeholder="Leave blank to use trip-weight tier"
                className={inputClass}
              />
              <p className="text-xs text-black/60">
                Fixed Rs/kg rate — overrides the trip-weight tier pricing in Cargo form.
              </p>
            </div>
          </div>

          {saveStatus !== "idle" && (
            <p
              className={`border px-4 py-2 text-sm ${
                saveStatus === "success"
                  ? "border-black text-black"
                  : "border-black text-black"
              }`}
            >
              {saveMsg}
            </p>
          )}

          <button
            type="submit"
            className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            Add to Material Master
          </button>
        </form>
      )}
    </div>
  );
}
