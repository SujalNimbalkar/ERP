"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MAINTENANCE_TYPES,
  type VehicleMaintenanceRecord,
  type VehicleOption,
  deleteMaintenance,
  getAllMaintenance,
  getMaintenanceCostSummary,
  getNextMaintenanceId,
  getVehicleById,
  getVehicleOptions,
  saveMaintenance,
} from "@/lib/vehicleStore";

const FIELD_CLASS =
  "w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none";

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

interface FieldProps { label: string; children: React.ReactNode; required?: boolean; }
function Field({ label, children, required }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-black">{label}{required && " *"}</label>
      {children}
    </div>
  );
}

export function VehicleMaintenanceForm() {
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [allRecords, setAllRecords] = useState<VehicleMaintenanceRecord[]>([]);
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [mode, setMode] = useState<"none" | "add" | "edit">("none");
  const [formValues, setFormValues] = useState<VehicleMaintenanceRecord>(() =>
    emptyForm(getNextMaintenanceId())
  );

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

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const record: VehicleMaintenanceRecord = {
      ...formValues,
      addedAt: mode === "add" ? new Date().toISOString() : formValues.addedAt,
    };
    saveMaintenance(record);
    setMode("none");
    refresh();
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
            className="border border-black bg-white px-3 py-2 text-sm text-black outline-none"
          >
            <option value="">All Vehicles</option>
            {vehicleOptions.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-3">
            <div className="border border-black px-4 py-2 text-xs text-black">
              <div className="font-semibold text-sm">{fmtCost(summary.total)}</div>
              <div className="text-black/60">Total spent</div>
            </div>
            <div className="border border-black px-4 py-2 text-xs text-black">
              <div className="font-semibold text-sm">{fmtCost(summary.thisYear)}</div>
              <div className="text-black/60">This year</div>
            </div>
            <div className="border border-black px-4 py-2 text-xs text-black">
              <div className="font-semibold text-sm">{fmtCost(summary.last30Days)}</div>
              <div className="text-black/60">Last 30 days</div>
            </div>
            <div className="border border-black px-4 py-2 text-xs text-black">
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
          className="mb-4 border border-black px-4 py-2 text-sm font-medium text-black"
        >
          + Add Maintenance Record
        </button>
      )}

      {/* ── add / edit form ── */}
      {mode !== "none" && (
        <form onSubmit={handleSubmit} className="mb-6 border border-black p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black">
              {mode === "edit"
                ? `Edit — ${formValues.id} · ${formValues.vehicleNo} · ${fmtDate(formValues.date)}`
                : "New Maintenance Record"}
            </h3>
            <div className="flex gap-2">
              <button
                type="submit"
                className="border border-black bg-white px-5 py-1.5 text-sm font-semibold text-black"
              >
                {mode === "edit" ? "Update" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="border border-black px-4 py-1.5 text-sm text-black"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Vehicle + Date */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Field label="Vehicle" required>
              <select
                name="vehicleId"
                required
                value={formValues.vehicleId}
                onChange={handleChange}
                className={FIELD_CLASS}
              >
                <option value="">Select vehicle…</option>
                {vehicleOptions.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Reg No (auto)">
              <input
                type="text"
                value={formValues.vehicleNo}
                readOnly
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Date" required>
              <input
                name="date"
                type="date"
                required
                value={formValues.date}
                onChange={handleChange}
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          {/* Type + Description */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Maintenance Type" required>
              <select
                name="maintenanceType"
                required
                value={formValues.maintenanceType}
                onChange={handleChange}
                className={FIELD_CLASS}
              >
                <option value="">Select…</option>
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Description" required>
              <input
                name="description"
                type="text"
                required
                value={formValues.description}
                onChange={handleChange}
                placeholder="Brief description of work done"
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          {/* Part details */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Part / Spares
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Part Name">
                <input
                  name="partName"
                  type="text"
                  value={formValues.partName}
                  onChange={handleChange}
                  placeholder="e.g. Engine Oil Filter"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Part Number">
                <input
                  name="partNumber"
                  type="text"
                  value={formValues.partNumber}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Vendor / Workshop">
                <input
                  name="vendorName"
                  type="text"
                  value={formValues.vendorName}
                  onChange={handleChange}
                  placeholder="e.g. Sharma Motors"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Invoice No">
                <input
                  name="invoiceNo"
                  type="text"
                  value={formValues.invoiceNo}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          {/* Cost */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Cost
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Labour Cost (Rs)">
                <input
                  name="labourCost"
                  type="number"
                  step="0.01"
                  value={formValues.labourCost}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Parts Cost (Rs)">
                <input
                  name="partsCost"
                  type="number"
                  step="0.01"
                  value={formValues.partsCost}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Total Cost (Rs, auto)">
                <input
                  type="number"
                  step="0.01"
                  value={formValues.totalCost}
                  readOnly
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          {/* Odometer + Next Service */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Odometer &amp; Next Service
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Current Odometer (km)">
                <input
                  name="odometerKm"
                  type="number"
                  value={formValues.odometerKm}
                  onChange={handleChange}
                  placeholder="Reading at service"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Next Service (km)">
                <input
                  name="nextServiceKm"
                  type="number"
                  value={formValues.nextServiceKm}
                  onChange={handleChange}
                  placeholder="Due at km"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Next Service Date">
                <input
                  name="nextServiceDate"
                  type="date"
                  value={formValues.nextServiceDate}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Done By">
                <input
                  name="doneBy"
                  type="text"
                  value={formValues.doneBy}
                  onChange={handleChange}
                  placeholder="Mechanic / driver name"
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          {/* Remarks */}
          <Field label="Remarks">
            <textarea
              name="remarks"
              value={formValues.remarks}
              onChange={handleChange}
              rows={2}
              placeholder="Additional notes…"
              className={FIELD_CLASS}
            />
          </Field>
        </form>
      )}

      {/* ── history table ── */}
      {displayedRecords.length === 0 ? (
        <p className="border border-black px-4 py-6 text-sm text-black">
          {vehicleOptions.length === 0
            ? "No vehicles registered. Add a vehicle in the Fleet tab first."
            : filterVehicleId
            ? `No maintenance records for ${selectedVehicle?.registrationNo ?? filterVehicleId}. Click + Add Maintenance Record above.`
            : "No maintenance records yet. Click + Add Maintenance Record above."}
        </p>
      ) : (
        <div className="overflow-x-auto border border-black">
          <table className="w-full border-collapse text-left text-xs text-black">
            <thead>
              <tr className="border-b border-black bg-white">
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Action</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">ID</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Date</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Vehicle</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Type</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Description</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Part</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Vendor</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Labour (Rs)</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Parts (Rs)</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Total (Rs)</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Odometer</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Next Service</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((m) => {
                const isEditingThis = mode === "edit" && formValues.id === m.id;
                return (
                <tr
                  key={m.id}
                  className={`border-b border-black/20 ${isEditingThis ? "bg-black/5" : "hover:bg-black/5"}`}
                >
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => isEditingThis ? cancelForm() : startEdit(m)}
                        className="text-black underline"
                      >
                        {isEditingThis ? "Cancel" : "Edit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m)}
                        className="text-black underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 font-mono">{m.id}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{fmtDate(m.date)}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 font-semibold">{m.vehicleNo || m.vehicleId}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{m.maintenanceType || "—"}</td>
                  <td className="max-w-48 truncate border-r border-black/20 px-3 py-2" title={m.description}>{m.description || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{m.partName || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{m.vendorName || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-right">{m.labourCost || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-right">{m.partsCost || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 text-right font-semibold">{m.totalCost || "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{m.odometerKm ? `${m.odometerKm} km` : "—"}</td>
                  <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">
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
    </div>
  );
}
