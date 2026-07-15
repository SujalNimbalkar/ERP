"use client";

import { useEffect, useMemo, useState } from "react";
import {
  VEHICLE_MAINTENANCE_SECTIONS,
  type VehicleMaintenanceRecord,
  type VehicleOption,
  deleteMaintenance,
  getAllMaintenance,
  getMaintenanceCostSummary,
  getNextMaintenanceId,
  getVehicleById,
  getVehicleOptions,
  injectFieldOptions,
  saveMaintenance,
} from "@/lib/vehicleStore";
import { FormField } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

function emptyForm(id: string, vehicleOpt?: VehicleOption): VehicleMaintenanceRecord {
  return {
    id,
    vehicleId: vehicleOpt?.value ?? "",
    vehicleNo: vehicleOpt?.registrationNo ?? "",
    date: new Date().toISOString().slice(0, 10),
    maintenanceType: "",
    partName: "",
    partNumber: "",
    description: "",
    vendorName: "",
    invoiceNo: "",
    labourCost: "",
    partsCost: "",
    totalCost: "",
    odometerKm: "",
    nextServiceKm: "",
    nextServiceDate: "",
    doneBy: "",
    remarks: "",
    addedAt: "",
  };
}

function fmtCost(n: number) {
  return `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(dateStr: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function VehicleMaintenanceForm() {
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [allRecords, setAllRecords] = useState<VehicleMaintenanceRecord[]>([]);
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [mode, setMode] = useState<"none" | "add" | "edit">("none");
  const [formValues, setFormValues] = useState<VehicleMaintenanceRecord>(() =>
    emptyForm(getNextMaintenanceId())
  );
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

  function refresh() {
    setVehicleOptions(getVehicleOptions());
    setAllRecords(getAllMaintenance());
  }

  useEffect(() => {
    refresh();
    window.addEventListener("sahyadri-vehicle-update", refresh);
    return () => window.removeEventListener("sahyadri-vehicle-update", refresh);
  }, []);

  const displayedRecords = useMemo(() => {
    if (!filterVehicleId) return allRecords.slice().sort((a, b) => b.date.localeCompare(a.date));
    return allRecords
      .filter((m) => m.vehicleId === filterVehicleId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allRecords, filterVehicleId]);

  const summary = useMemo(() => {
    if (!filterVehicleId) return null;
    return getMaintenanceCostSummary(filterVehicleId);
  }, [allRecords, filterVehicleId]);

  const selectedVehicle = useMemo(() =>
    filterVehicleId ? vehicleOptions.find((v) => v.value === filterVehicleId) : undefined,
    [vehicleOptions, filterVehicleId]
  );

  const sections = useMemo(
    () => injectFieldOptions(VEHICLE_MAINTENANCE_SECTIONS, "vehicleId", vehicleOptions),
    [vehicleOptions]
  );

  function handleChange(name: string, value: string) {
    setFormValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "vehicleId") {
        const vehicle = getVehicleById(value);
        next.vehicleNo = vehicle?.registrationNo ?? "";
      }
      if (name === "labourCost" || name === "partsCost") {
        const labour = Number(name === "labourCost" ? value : prev.labourCost) || 0;
        const parts = Number(name === "partsCost" ? value : prev.partsCost) || 0;
        next.totalCost = labour + parts > 0 ? String(Math.round((labour + parts) * 100) / 100) : "";
      }
      return next;
    });
  }

  function startAdd() {
    setFormValues(emptyForm(getNextMaintenanceId(), selectedVehicle));
    setMode("add");
  }

  function startEdit(m: VehicleMaintenanceRecord) {
    setFormValues({ ...m });
    setMode("edit");
  }

  function cancelForm() {
    setMode("none");
  }

  function performSave() {
    const wasEditing = mode === "edit";
    const record: VehicleMaintenanceRecord = {
      ...formValues,
      addedAt: mode === "add" ? new Date().toISOString() : formValues.addedAt,
    };
    saveMaintenance(record);
    setMode("none");
    refresh();
    notify(`Maintenance record ${wasEditing ? "updated" : "saved"}.`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestConfirm(performSave);
  }

  function handleDelete(m: VehicleMaintenanceRecord) {
    const label = `${m.maintenanceType || "maintenance"} on ${fmtDate(m.date)} for ${m.vehicleNo}`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleteMaintenance(m.id);
    if (mode === "edit" && formValues.id === m.id) setMode("none");
    refresh();
  }

  return (
    <div>
      {/* ── filter + summary bar ── */}
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">Filter by Vehicle</label>
          <select
            value={filterVehicleId}
            onChange={(e) => {
              setFilterVehicleId(e.target.value);
              setMode("none");
            }}
            className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            <option value="">All Vehicles</option>
            {vehicleOptions.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-3">
            <div className="rounded-md border border-black/10 bg-white px-4 py-2 text-xs text-black shadow-sm">
              <div className="font-semibold text-sm">{fmtCost(summary.total)}</div>
              <div className="text-black/60">Total spent</div>
            </div>
            <div className="rounded-md border border-black/10 bg-white px-4 py-2 text-xs text-black shadow-sm">
              <div className="font-semibold text-sm">{fmtCost(summary.thisYear)}</div>
              <div className="text-black/60">This year</div>
            </div>
            <div className="rounded-md border border-black/10 bg-white px-4 py-2 text-xs text-black shadow-sm">
              <div className="font-semibold text-sm">{fmtCost(summary.last30Days)}</div>
              <div className="text-black/60">Last 30 days</div>
            </div>
            <div className="rounded-md border border-black/10 bg-white px-4 py-2 text-xs text-black shadow-sm">
              <div className="font-semibold text-sm">{summary.count}</div>
              <div className="text-black/60">Records</div>
            </div>
          </div>
        )}
      </div>

      {/* ── add button ── */}
      {mode === "none" && (
        <button
          type="button"
          onClick={startAdd}
          className="mb-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          + Add Maintenance Record
        </button>
      )}

      {/* ── add / edit form ── */}
      {mode !== "none" && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-5 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black">
              {mode === "edit"
                ? `Edit — ${formValues.id} · ${formValues.vehicleNo} · ${fmtDate(formValues.date)}`
                : "New Maintenance Record"}
            </h3>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-brand px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                {mode === "edit" ? "Update" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-md border border-black/15 px-4 py-1.5 text-sm text-black transition-colors hover:bg-black/5"
              >
                Cancel
              </button>
            </div>
          </div>

          {sections.map((section) => (
            <FormSection
              key={section.id}
              title={section.title}
              columns={section.id === "type-description" ? 2 : section.id === "cost" ? 3 : 4}
            >
              {section.fields.map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={formValues[field.name as keyof VehicleMaintenanceRecord] as string}
                  onChange={handleChange}
                />
              ))}
            </FormSection>
          ))}
        </form>
      )}

      {/* ── history table ── */}
      {displayedRecords.length === 0 ? (
        <p className="rounded-lg border border-black/10 bg-white px-4 py-6 text-sm text-black shadow-sm">
          {vehicleOptions.length === 0
            ? "No vehicles registered. Add a vehicle in the Fleet tab first."
            : filterVehicleId
            ? `No maintenance records for ${selectedVehicle?.registrationNo ?? filterVehicleId}. Click + Add Maintenance Record above.`
            : "No maintenance records yet. Click + Add Maintenance Record above."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
          <table className="w-full border-collapse text-left text-xs text-black">
            <thead>
              <tr className="border-b border-black/10 bg-page">
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Action</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">ID</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Date</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Vehicle</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Type</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Description</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Part</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Vendor</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Labour (Rs)</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Parts (Rs)</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Total (Rs)</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Odometer</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Next Service</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((m) => {
                const isEditingThis = mode === "edit" && formValues.id === m.id;
                return (
                <tr
                  key={m.id}
                  className={`border-b border-black/10 ${isEditingThis ? "bg-black/5" : "hover:bg-black/5"}`}
                >
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => isEditingThis ? cancelForm() : startEdit(m)}
                        className="text-brand-text underline"
                      >
                        {isEditingThis ? "Cancel" : "Edit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m)}
                        className="text-critical underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-mono">{m.id}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{fmtDate(m.date)}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">{m.vehicleNo || m.vehicleId}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{m.maintenanceType || "—"}</td>
                  <td className="max-w-48 truncate border-r border-black/10 px-3 py-2" title={m.description}>{m.description || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{m.partName || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{m.vendorName || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-right">{m.labourCost || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-right">{m.partsCost || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 text-right font-semibold">{m.totalCost || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{m.odometerKm ? `${m.odometerKm} km` : "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">
                    {m.nextServiceDate ? fmtDate(m.nextServiceDate) : m.nextServiceKm ? `${m.nextServiceKm} km` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{m.invoiceNo || "—"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-black">
        Showing {displayedRecords.length} record(s)
        {filterVehicleId && summary ? ` · ${fmtCost(summary.total)} total maintenance cost` : ""}
      </p>

      <ConfirmDialog
        open={confirmOpen}
        message={mode === "edit" ? "Update this maintenance record?" : "Save this maintenance record?"}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
