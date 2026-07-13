"use client";

import { useEffect, useState } from "react";
import {
  deleteCustomParty,
  getCustomParties,
  saveCustomParty,
  type PartyEntry,
} from "@/lib/partyStore";
import {
  deleteCustomCargoSource,
  getCustomCargoSources,
  saveCustomCargoSource,
  slugifyCargoSourceType,
  type CustomCargoSource,
} from "@/lib/cargoSourceStore";
import { BUILT_IN_CARGO_SOURCES, getAllCargoSources, type CargoSource } from "@/lib/sheetConfig";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

const TOP_TABS = [
  { id: "vendors", label: "Delivery Vendors" },
  { id: "plants", label: "Cargo Plants" },
] as const;

type TopTabId = (typeof TOP_TABS)[number]["id"];

const inputClass =
  "w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:border-black";

function isCustomSource(s: CargoSource): s is CustomCargoSource {
  return !BUILT_IN_CARGO_SOURCES.some((b) => b.type === s.type);
}

function VendorsTab() {
  const [subTab, setSubTab] = useState<"browse" | "add">("browse");
  const [parties, setParties] = useState<PartyEntry[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  function refresh() {
    setParties(getCustomParties());
  }

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-party-update", onUpdate);
    return () => window.removeEventListener("sahyadri-party-update", onUpdate);
  }, []);

  function performAdd(trimName: string, trimNotes: string) {
    saveCustomParty({
      id: `party-${Date.now()}`,
      name: trimName,
      notes: trimNotes,
    });
    setName("");
    setNotes("");
    refresh();
    notify(`Delivery vendor "${trimName}" added.`);
  }

  function handleAdd(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimName = name.trim();
    const trimNotes = notes.trim();
    if (!trimName) {
      setError("Name is required.");
      return;
    }
    if (parties.some((p) => p.name.toLowerCase() === trimName.toLowerCase())) {
      setError(`A delivery vendor named "${trimName}" already exists.`);
      return;
    }
    setError("");
    requestConfirm(() => performAdd(trimName, trimNotes));
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Remove delivery vendor "${label}"?`)) return;
    deleteCustomParty(id);
    refresh();
  }

  return (
    <div>
      <div className="mt-4 flex flex-wrap border border-black">
        {(["browse", "add"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setSubTab(tab);
              setError("");
            }}
            className={`px-3 py-1.5 text-sm text-black ${
              subTab === tab ? "font-semibold underline" : "font-normal"
            }`}
          >
            {tab === "browse" ? "Browse" : "Add Vendor"}
          </button>
        ))}
      </div>

      {subTab === "browse" && (
        <div className="mt-4">
          {parties.length === 0 ? (
            <p className="text-sm text-black">
              No delivery vendors added yet. Cargo Transport's &ldquo;To&rdquo; field
              already lists every plant automatically — add a vendor here only for
              destinations that aren&apos;t one of your plants.
            </p>
          ) : (
            <div className="overflow-x-auto border border-black">
              <table className="w-full border-collapse text-left text-sm text-black">
                <thead>
                  <tr className="border-b border-black bg-white">
                    <th className="border-r border-black/30 px-3 py-2 text-xs font-semibold">
                      Name
                    </th>
                    <th className="border-r border-black/30 px-3 py-2 text-xs font-semibold">
                      Notes
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                    <tr key={p.id} className="border-b border-black/20 hover:bg-black/5">
                      <td className="border-r border-black/20 px-3 py-2 text-xs">{p.name}</td>
                      <td className="border-r border-black/20 px-3 py-2 text-xs">
                        {p.notes || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id, p.name)}
                          className="text-black underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === "add" && (
        <form onSubmit={handleAdd} className="mt-4 max-w-lg space-y-4">
          <div className="border border-black p-4 space-y-4">
            <h3 className="text-sm font-semibold text-black">New Delivery Vendor</h3>
            <div className="flex flex-col gap-1">
              <label htmlFor="party-name" className="text-sm font-medium text-black">
                Name <span>*</span>
              </label>
              <input
                id="party-name"
                type="text"
                value={name}
                required
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="e.g. Cast Iron Foundry, ABC Traders"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="party-notes" className="text-sm font-medium text-black">
                Notes (optional)
              </label>
              <textarea
                id="party-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. address, contact person"
                className={inputClass}
                rows={3}
              />
            </div>
          </div>
          {error && <p className="border border-black px-4 py-2 text-sm text-black">{error}</p>}
          <button
            type="submit"
            className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            Add Vendor
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message="Add this delivery vendor to the destination list?"
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}

function PlantsTab() {
  const [subTab, setSubTab] = useState<"browse" | "add">("browse");
  const [sources, setSources] = useState<CargoSource[]>([]);
  const [label, setLabel] = useState("");
  const [sheetTab, setSheetTab] = useState("");
  const [sheetTabTouched, setSheetTabTouched] = useState(false);
  const [error, setError] = useState("");
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  function refresh() {
    setSources(getAllCargoSources());
  }

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("sahyadri-cargo-source-update", onUpdate);
    return () => window.removeEventListener("sahyadri-cargo-source-update", onUpdate);
  }, []);

  function performAdd(trimLabel: string, trimSheetTab: string, type: string) {
    saveCustomCargoSource({ type, label: trimLabel, sheetTab: trimSheetTab });
    setLabel("");
    setSheetTab("");
    setSheetTabTouched(false);
    refresh();
    notify(`Cargo plant "${trimLabel}" added — it now appears as a Cargo Transport source.`);
  }

  function handleAdd(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimLabel = label.trim();
    const trimSheetTab = (sheetTab.trim() || trimLabel);
    if (!trimLabel) {
      setError("Plant name is required.");
      return;
    }
    const type = slugifyCargoSourceType(trimLabel);
    if (sources.some((s) => s.type === type)) {
      setError(`A plant with a matching name already exists.`);
      return;
    }
    setError("");
    requestConfirm(() => performAdd(trimLabel, trimSheetTab, type));
  }

  function handleDelete(type: string, plantLabel: string) {
    if (
      !confirm(
        `Remove cargo plant "${plantLabel}"? Trips already saved for it stay in Saved Records, but it will disappear as a Cargo Transport source.`
      )
    )
      return;
    deleteCustomCargoSource(type);
    refresh();
  }

  return (
    <div>
      <div className="mt-4 flex flex-wrap border border-black">
        {(["browse", "add"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setSubTab(tab);
              setError("");
            }}
            className={`px-3 py-1.5 text-sm text-black ${
              subTab === tab ? "font-semibold underline" : "font-normal"
            }`}
          >
            {tab === "browse" ? "Browse" : "Add Plant"}
          </button>
        ))}
      </div>

      {subTab === "browse" && (
        <div className="mt-4 overflow-x-auto border border-black">
          <table className="w-full border-collapse text-left text-sm text-black">
            <thead>
              <tr className="border-b border-black bg-white">
                <th className="border-r border-black/30 px-3 py-2 text-xs font-semibold">
                  Plant
                </th>
                <th className="border-r border-black/30 px-3 py-2 text-xs font-semibold">
                  Sheet Tab
                </th>
                <th className="border-r border-black/30 px-3 py-2 text-xs font-semibold">
                  Source
                </th>
                <th className="px-3 py-2 text-xs font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.type} className="border-b border-black/20 hover:bg-black/5">
                  <td className="border-r border-black/20 px-3 py-2 text-xs">{s.label}</td>
                  <td className="border-r border-black/20 px-3 py-2 text-xs">{s.sheetTab}</td>
                  <td className="border-r border-black/20 px-3 py-2 text-xs">
                    {isCustomSource(s) ? (
                      <span className="font-medium">Custom</span>
                    ) : (
                      <span className="text-black/50">Built-in</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {isCustomSource(s) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(s.type, s.label)}
                        className="text-black underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "add" && (
        <form onSubmit={handleAdd} className="mt-4 max-w-lg space-y-4">
          <div className="border border-black p-4 space-y-4">
            <h3 className="text-sm font-semibold text-black">New Cargo Plant</h3>
            <div className="flex flex-col gap-1">
              <label htmlFor="plant-label" className="text-sm font-medium text-black">
                Plant Name <span>*</span>
              </label>
              <input
                id="plant-label"
                type="text"
                value={label}
                required
                onChange={(e) => {
                  setLabel(e.target.value);
                  setError("");
                  if (!sheetTabTouched) setSheetTab(e.target.value);
                }}
                placeholder="e.g. New Foundry - Satara"
                className={inputClass}
              />
              <p className="text-xs text-black/60">
                Shows as a tab-bar button in Cargo Transport and as a &ldquo;To&rdquo;
                option on every other plant.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="plant-sheet-tab" className="text-sm font-medium text-black">
                Google Sheet Tab Name
              </label>
              <input
                id="plant-sheet-tab"
                type="text"
                value={sheetTab}
                onChange={(e) => {
                  setSheetTab(e.target.value);
                  setSheetTabTouched(true);
                }}
                placeholder="Defaults to the plant name"
                className={inputClass}
              />
              <p className="text-xs text-black/60">
                The tab is created automatically in the spreadsheet on first save if it
                doesn&apos;t already exist.
              </p>
            </div>
          </div>
          {error && <p className="border border-black px-4 py-2 text-sm text-black">{error}</p>}
          <button
            type="submit"
            className="border border-black bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            Add Plant
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message="Add this cargo plant as a new Cargo Transport source?"
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}

export function PartyMasterModule() {
  const [topTab, setTopTab] = useState<TopTabId>("vendors");

  return (
    <div className="max-w-4xl">
      <div className="mb-2">
        <h2 className="text-xl font-semibold text-black">Plants & Vendors</h2>
        <p className="mt-1 text-sm text-black">
          Add new Cargo Transport plants (origins) or delivery vendors (destinations
          outside your own plants).
        </p>
        <div className="mt-4 flex flex-wrap border border-black">
          {TOP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTopTab(tab.id)}
              className={`px-3 py-1.5 text-sm text-black ${
                topTab === tab.id ? "font-semibold underline" : "font-normal"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {topTab === "vendors" ? <VendorsTab /> : <PlantsTab />}
    </div>
  );
}
