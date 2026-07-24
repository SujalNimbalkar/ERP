"use client";

import { useMemo, useState } from "react";
import {
  computeVehiclePerformance,
  statusColor,
  type VehicleMetrics,
  type VehiclePerformance,
} from "@/lib/vehiclePerformance";

const GOOD = "#0ca30c";
const CRITICAL = "#d03b3b";
const WARNING = "#fab219";
const SERIOUS = "#ec835a";
const DIESEL = "var(--color-diesel)";

/** Trips/month "full marks" target used both by the score formula (see
 * lib/vehiclePerformance.ts) and the quadrant chart's vertical divider — kept
 * as a single re-derived constant here (half the trips-score target) so the
 * two never drift apart. */
const TRIPS_TARGET_PER_MONTH = 4;

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-black/30 text-[9px] font-semibold text-black/50"
    >
      i
    </span>
  );
}

function Card({
  title,
  tooltip,
  action,
  children,
}: {
  title: string;
  tooltip?: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-semibold text-black">{title}</h4>
          {tooltip && <InfoIcon tooltip={tooltip} />}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs font-medium text-brand-text underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

const TOP_N_DEFAULT = 6;

/** A vehicle name truncated for a narrow row label — the full name is
 * always in the title attribute and the Vehicle Summary table below. */
function VehicleLabel({ vehicleNo, className }: { vehicleNo: string; className?: string }) {
  return (
    <span className={className} title={vehicleNo}>
      {vehicleNo}
    </span>
  );
}

function ProfitMarginCard({ rows }: { rows: { vehicleNo: string; value: number }[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows]);
  const visible = expanded ? sorted : sorted.slice(0, TOP_N_DEFAULT);
  const maxAbs = Math.max(1, ...sorted.map((r) => Math.abs(r.value)));

  return (
    <Card
      title="Profit Margin by Vehicle"
      tooltip="Profit ÷ earnings, per vehicle"
      action={
        sorted.length > TOP_N_DEFAULT
          ? { label: expanded ? "Show fewer" : "View Details →", onClick: () => setExpanded((e) => !e) }
          : undefined
      }
    >
      {sorted.length === 0 ? (
        <p className="text-xs text-black/50">No data in this range.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const pct = Math.min(100, (Math.abs(r.value) / maxAbs) * 50);
            const negative = r.value < 0;
            return (
              <div key={r.vehicleNo} className="flex items-center gap-2 text-xs">
                <VehicleLabel vehicleNo={r.vehicleNo} className="w-20 shrink-0 truncate font-medium text-black" />
                <div className="relative h-3.5 flex-1 rounded-full bg-black/5">
                  <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-black/20" />
                  <div
                    className={`absolute inset-y-0 h-3.5 ${negative ? "rounded-l-full" : "rounded-r-full"}`}
                    style={{
                      left: negative ? `${50 - pct}%` : "50%",
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: negative ? CRITICAL : GOOD,
                    }}
                    title={`${r.vehicleNo}: ${r.value.toFixed(1)}%`}
                  />
                </div>
                <span
                  className="w-14 shrink-0 text-right font-semibold"
                  style={{ color: negative ? CRITICAL : GOOD }}
                >
                  {r.value.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RadialGauge({ vehicleNo, percent }: { vehicleNo: string; percent: number }) {
  const size = 84;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const dash = (clamped / 100) * c;
  const color = percent >= 85 ? GOOD : percent >= 60 ? WARNING : SERIOUS;

  return (
    <div className="flex flex-col items-center gap-1" title={`${vehicleNo}: ${Math.round(percent)}% of rated capacity`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e1e0d9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="600" fill="#0b0b0b">
          {Math.round(percent)}%
        </text>
      </svg>
      <VehicleLabel vehicleNo={vehicleNo} className="max-w-[84px] truncate text-xs font-medium text-black" />
    </div>
  );
}

function CapacityUtilizationCard({
  rows,
  emptyNote,
}: {
  rows: { vehicleNo: string; value: number }[];
  emptyNote?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows]);
  const visible = expanded ? sorted : sorted.slice(0, TOP_N_DEFAULT);

  return (
    <Card
      title="Capacity Utilization"
      tooltip="Average weight/trip vs the vehicle's rated load capacity"
      action={
        sorted.length > TOP_N_DEFAULT
          ? { label: expanded ? "Show fewer" : "View Details →", onClick: () => setExpanded((e) => !e) }
          : undefined
      }
    >
      {sorted.length === 0 ? (
        <p className="text-xs text-black/50">No data in this range.</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {visible.map((r) => (
            <RadialGauge key={r.vehicleNo} vehicleNo={r.vehicleNo} percent={r.value} />
          ))}
        </div>
      )}
      {emptyNote && <p className="mt-3 text-[11px] text-black/50">{emptyNote}</p>}
    </Card>
  );
}

function VerticalBarChart({
  rows,
  color,
  formatValue,
}: {
  rows: { vehicleNo: string; value: number }[];
  color: string;
  formatValue: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex items-end gap-2.5" style={{ height: 132 }}>
      {rows.map((r) => (
        <div key={r.vehicleNo} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-semibold text-black">{formatValue(r.value)}</span>
          <div className="flex w-full flex-1 items-end justify-center">
            <div
              className="w-5 rounded-t-md sm:w-6"
              style={{ height: `${Math.max((r.value / max) * 100, 2)}%`, backgroundColor: color }}
              title={`${r.vehicleNo}: ${formatValue(r.value)}`}
            />
          </div>
          <VehicleLabel vehicleNo={r.vehicleNo} className="max-w-full truncate text-[10px] text-black/60" />
        </div>
      ))}
    </div>
  );
}

function TripsPerMonthCard({ rows }: { rows: { vehicleNo: string; value: number }[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows]);
  return (
    <Card title="Trips per Month" tooltip="Trip count ÷ months in the selected range">
      {sorted.length === 0 ? (
        <p className="text-xs text-black/50">No data in this range.</p>
      ) : (
        <VerticalBarChart rows={sorted} color="#0b0b0b" formatValue={(v) => v.toFixed(1)} />
      )}
    </Card>
  );
}

function FuelEfficiencyCard({
  rows,
  emptyNote,
}: {
  rows: { vehicleNo: string; value: number }[];
  emptyNote?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows]);
  const visible = expanded ? sorted : sorted.slice(0, TOP_N_DEFAULT);
  const fleetAvg = sorted.length > 0 ? sorted.reduce((s, r) => s + r.value, 0) / sorted.length : null;

  return (
    <Card
      title="Fuel Efficiency (km/liter)"
      tooltip="Between whichever diesel fills happen to carry an odometer reading"
      action={
        sorted.length > TOP_N_DEFAULT
          ? { label: expanded ? "Show fewer" : "View Details →", onClick: () => setExpanded((e) => !e) }
          : undefined
      }
    >
      {fleetAvg !== null && (
        <span className="mb-2 inline-block rounded-full bg-good-tint px-2 py-0.5 text-[11px] font-medium text-good">
          Fleet Avg: {fleetAvg.toFixed(1)} km/L
        </span>
      )}
      {sorted.length === 0 ? (
        <p className="text-xs text-black/50">No odometer data yet.</p>
      ) : (
        <VerticalBarChart rows={visible} color={DIESEL} formatValue={(v) => v.toFixed(1)} />
      )}
      {emptyNote && <p className="mt-3 text-[11px] text-black/50">{emptyNote}</p>}
    </Card>
  );
}

function QuadrantScatter({
  points,
}: {
  points: { vehicleNo: string; trips: number; profit: number }[];
}) {
  const width = 340;
  const height = 220;
  const pad = { left: 34, right: 12, top: 12, bottom: 24 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xMax = Math.max(5, ...points.map((p) => Math.ceil(p.trips)));
  const yAbsMax = Math.max(40, ...points.map((p) => Math.ceil(Math.abs(p.profit) / 20) * 20));
  const yMin = -yAbsMax;
  const yMax = yAbsMax;

  const xPx = (trips: number) => pad.left + (trips / xMax) * plotW;
  const yPx = (profit: number) => pad.top + (1 - (profit - yMin) / (yMax - yMin)) * plotH;

  const xDivider = TRIPS_TARGET_PER_MONTH / 2;
  const yDivider = 0;
  const xDividerPx = xPx(xDivider);
  const yDividerPx = yPx(yDivider);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Profit margin vs trips per month, by vehicle">
        {/* Quadrant tints — only the two diagonal corners that carry a label */}
        <rect
          x={xDividerPx}
          y={pad.top}
          width={pad.left + plotW - xDividerPx}
          height={yDividerPx - pad.top}
          fill={GOOD}
          opacity={0.08}
        />
        <rect
          x={pad.left}
          y={yDividerPx}
          width={xDividerPx - pad.left}
          height={pad.top + plotH - yDividerPx}
          fill={CRITICAL}
          opacity={0.08}
        />

        {/* Axes */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#c3c2b7" strokeWidth={1} />
        <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="#c3c2b7" strokeWidth={1} />
        {/* Quadrant divider lines */}
        <line x1={xDividerPx} y1={pad.top} x2={xDividerPx} y2={pad.top + plotH} stroke="#e1e0d9" strokeWidth={1} />
        <line x1={pad.left} y1={yDividerPx} x2={pad.left + plotW} y2={yDividerPx} stroke="#e1e0d9" strokeWidth={1} />

        <text x={pad.left + plotW - 4} y={pad.top + 12} textAnchor="end" fontSize="9" fontWeight="600" fill={GOOD}>
          Top Performers
        </text>
        <text x={pad.left + 4} y={pad.top + plotH - 4} textAnchor="start" fontSize="9" fontWeight="600" fill={CRITICAL}>
          Needs Attention
        </text>

        {/* Y axis labels */}
        <text x={pad.left - 4} y={pad.top + 4} textAnchor="end" fontSize="9" fill="#898781">{yMax}%</text>
        <text x={pad.left - 4} y={pad.top + plotH + 4} textAnchor="end" fontSize="9" fill="#898781">{yMin}%</text>
        {/* X axis labels */}
        <text x={pad.left} y={height - 6} textAnchor="middle" fontSize="9" fill="#898781">0</text>
        <text x={pad.left + plotW} y={height - 6} textAnchor="middle" fontSize="9" fill="#898781">{xMax}</text>
        <text x={pad.left + plotW / 2} y={height - 6} textAnchor="middle" fontSize="9" fill="#898781">Trips per Month</text>

        {points.map((p) => {
          const cx = xPx(p.trips);
          const cy = yPx(p.profit);
          const color = p.profit < 0 ? CRITICAL : GOOD;
          // A label always placed to the dot's right runs past the SVG's own
          // edge for points near the right side of the plot (no room to grow
          // into) — flip it to the left of the dot once past ~70% of plotW.
          const nearRightEdge = cx > pad.left + plotW * 0.7;
          return (
            <g key={p.vehicleNo}>
              <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fcfcfb" strokeWidth={2} />
              <title>{`${p.vehicleNo}: ${p.profit.toFixed(1)}% margin, ${p.trips.toFixed(1)} trips/mo`}</title>
              <text
                x={nearRightEdge ? cx - 7 : cx + 7}
                y={cy + 3}
                textAnchor={nearRightEdge ? "end" : "start"}
                fontSize="9"
                fill="#0b0b0b"
              >
                {p.vehicleNo}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const bg = rank === 1 ? "#eab308" : rank === 2 ? "#9ca3af" : rank === 3 ? "#b45309" : "#e1e0d9";
  const fg = rank <= 3 ? "#ffffff" : "#52514e";
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {rank}
    </span>
  );
}

function VehiclePerformanceScoreCard({ items }: { items: VehiclePerformance[] }) {
  const sorted = useMemo(() => [...items].sort((a, b) => b.score - a.score), [items]);
  return (
    <Card title="Vehicle Performance Score" tooltip="Weighted blend of profit margin, capacity, fuel efficiency, and trips/month">
      {sorted.length === 0 ? (
        <p className="text-xs text-black/50">No data in this range.</p>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((item, i) => (
            <div key={item.vehicleNo} className="flex items-center gap-2.5 text-xs">
              <RankBadge rank={i + 1} />
              <VehicleLabel vehicleNo={item.vehicleNo} className="w-20 shrink-0 truncate font-medium text-black" />
              <div className="relative h-2 flex-1 rounded-full bg-black/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${item.score}%`, backgroundColor: statusColor(item.status) }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-semibold text-black">{item.score}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatusDot({ status }: { status: VehiclePerformance["status"] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(status) }} />
      {status}
    </span>
  );
}

function VehicleSummaryTable({ items }: { items: VehiclePerformance[] }) {
  const sorted = useMemo(() => [...items].sort((a, b) => b.score - a.score), [items]);
  const cell = "px-2.5 py-2 text-xs";
  const cellRight = `${cell} text-right whitespace-nowrap`;

  return (
    <div className="rounded-lg border border-black/10 bg-white shadow-sm">
      <p className="border-b border-black/10 px-3 py-2 text-sm font-semibold text-black">Vehicle Summary</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-black">
          <thead>
            <tr className="bg-page">
              {["Vehicle No.", "Fuel Efficiency (km/L)", "Profit Margin %", "Capacity Utilization %", "Trips/Month", "Performance Score", "Status"].map(
                (h) => (
                  <th key={h} className={`${cell} text-left font-semibold`}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td className={cell} colSpan={7}>
                  No trips in this range.
                </td>
              </tr>
            ) : (
              sorted.map((v) => (
                <tr key={v.vehicleNo} className="border-t border-black/10">
                  <td className={`${cell} font-medium whitespace-nowrap`}>{v.vehicleNo}</td>
                  <td className={cellRight}>
                    {v.fuelEfficiencyKmPerLiter !== null ? v.fuelEfficiencyKmPerLiter.toFixed(1) : "—"}
                  </td>
                  <td
                    className={`${cellRight} font-semibold`}
                    style={{ color: v.profitMarginPercent !== null && v.profitMarginPercent < 0 ? CRITICAL : GOOD }}
                  >
                    {v.profitMarginPercent !== null ? `${v.profitMarginPercent.toFixed(1)}%` : "—"}
                  </td>
                  <td className={cellRight}>
                    {v.capacityUtilizationPercent !== null ? `${v.capacityUtilizationPercent.toFixed(0)}%` : "—"}
                  </td>
                  <td className={cellRight}>{v.tripsPerMonth.toFixed(1)}</td>
                  <td className={cellRight}>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: statusColor(v.status) }}
                    >
                      {v.score}
                    </span>
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    <StatusDot status={v.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VehiclePerformanceSection({ metrics }: { metrics: VehicleMetrics[] }) {
  const performances = useMemo(() => metrics.map(computeVehiclePerformance), [metrics]);

  const profitRows = useMemo(
    () =>
      metrics
        .filter((m) => m.profitMarginPercent !== null)
        .map((m) => ({ vehicleNo: m.vehicleNo, value: m.profitMarginPercent as number })),
    [metrics]
  );
  const capacityRows = useMemo(
    () =>
      metrics
        .filter((m) => m.capacityUtilizationPercent !== null)
        .map((m) => ({ vehicleNo: m.vehicleNo, value: m.capacityUtilizationPercent as number })),
    [metrics]
  );
  const fuelRows = useMemo(
    () =>
      metrics
        .filter((m) => m.fuelEfficiencyKmPerLiter !== null)
        .map((m) => ({ vehicleNo: m.vehicleNo, value: m.fuelEfficiencyKmPerLiter as number })),
    [metrics]
  );
  const tripsRows = useMemo(
    () => metrics.map((m) => ({ vehicleNo: m.vehicleNo, value: m.tripsPerMonth })),
    [metrics]
  );
  const quadrantPoints = useMemo(
    () =>
      metrics
        .filter((m) => m.profitMarginPercent !== null)
        .map((m) => ({ vehicleNo: m.vehicleNo, trips: m.tripsPerMonth, profit: m.profitMarginPercent as number })),
    [metrics]
  );

  const vehiclesMissingCapacity = metrics.filter((m) => m.capacityUtilizationPercent === null).map((m) => m.vehicleNo);
  const vehiclesMissingFuel = metrics.filter((m) => m.fuelEfficiencyKmPerLiter === null).map((m) => m.vehicleNo);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ProfitMarginCard rows={profitRows} />
        <CapacityUtilizationCard
          rows={capacityRows}
          emptyNote={
            vehiclesMissingCapacity.length > 0
              ? `No rated capacity set: ${vehiclesMissingCapacity.join(", ")}`
              : undefined
          }
        />
        <TripsPerMonthCard rows={tripsRows} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <FuelEfficiencyCard
          rows={fuelRows}
          emptyNote={
            vehiclesMissingFuel.length > 0 ? `No odometer readings yet: ${vehiclesMissingFuel.join(", ")}` : undefined
          }
        />
        <Card title="Performance Quadrant" tooltip="Profit Margin vs Trips per Month">
          {quadrantPoints.length === 0 ? (
            <p className="text-xs text-black/50">No data in this range.</p>
          ) : (
            <QuadrantScatter points={quadrantPoints} />
          )}
        </Card>
        <VehiclePerformanceScoreCard items={performances} />
      </div>
      <VehicleSummaryTable items={performances} />
    </div>
  );
}
