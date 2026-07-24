/**
 * Composite 0-100 "Performance Score" per vehicle, blending the four
 * efficiency angles already on the Dashboard into one ranked figure — the
 * formula and targets below were specified by the business, not derived:
 *
 *   Score = 0.40×Profit + 0.25×Capacity + 0.20×Fuel + 0.15×Trips
 *
 * Each component is normalized to 0-100 against a fixed target/band before
 * weighting (see the constants below). A vehicle missing an input (no rated
 * capacity set, no odometer reading yet) simply drops that component and
 * re-normalizes the remaining weights, rather than scoring it 0 — a vehicle
 * shouldn't be penalized for a reading nobody has taken yet.
 */

export interface VehicleMetrics {
  vehicleNo: string;
  /** Profit ÷ earnings × 100 — null when the vehicle has no earnings (no revenue to divide by). */
  profitMarginPercent: number | null;
  /** Avg weight/trip ÷ rated load capacity × 100 — null when no rated capacity is set. */
  capacityUtilizationPercent: number | null;
  /** Distance-weighted km/liter — null when fewer than 2 odometer readings exist in range. */
  fuelEfficiencyKmPerLiter: number | null;
  tripsPerMonth: number;
}

export type PerformanceStatus = "Excellent" | "Good" | "Average" | "Needs Attention" | "Critical";

export interface VehiclePerformance extends VehicleMetrics {
  score: number;
  status: PerformanceStatus;
}

const WEIGHTS = { profit: 0.4, capacity: 0.25, fuel: 0.2, trips: 0.15 };

/** A 50% profit margin scores full marks on the Profit component. */
const TARGET_PROFIT_MARGIN_PERCENT = 50;
/** Fuel efficiency band this fleet is scored against — a fixed assumption
 * (not derived per-fleet), tune here if the vehicle mix changes materially. */
const FUEL_WORST_KMPL = 10;
const FUEL_BEST_KMPL = 18;
/** 4 trips/month scores full marks on the Utilization component. */
const TARGET_TRIPS_PER_MONTH = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeVehiclePerformance(metrics: VehicleMetrics): VehiclePerformance {
  const components: { weight: number; score: number }[] = [];

  if (metrics.profitMarginPercent !== null) {
    components.push({
      weight: WEIGHTS.profit,
      score: clamp((metrics.profitMarginPercent / TARGET_PROFIT_MARGIN_PERCENT) * 100, 0, 100),
    });
  }
  if (metrics.capacityUtilizationPercent !== null) {
    components.push({
      weight: WEIGHTS.capacity,
      score: clamp(metrics.capacityUtilizationPercent, 0, 100),
    });
  }
  if (metrics.fuelEfficiencyKmPerLiter !== null) {
    components.push({
      weight: WEIGHTS.fuel,
      score: clamp(
        ((metrics.fuelEfficiencyKmPerLiter - FUEL_WORST_KMPL) / (FUEL_BEST_KMPL - FUEL_WORST_KMPL)) * 100,
        0,
        100
      ),
    });
  }
  components.push({
    weight: WEIGHTS.trips,
    score: clamp((metrics.tripsPerMonth / TARGET_TRIPS_PER_MONTH) * 100, 0, 100),
  });

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const score =
    totalWeight > 0
      ? Math.round(components.reduce((sum, c) => sum + c.weight * c.score, 0) / totalWeight)
      : 0;

  return { ...metrics, score, status: statusForScore(score) };
}

export function statusForScore(score: number): PerformanceStatus {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Average";
  if (score >= 40) return "Needs Attention";
  return "Critical";
}

/** Reserved status palette (good/warning/serious/critical) — Excellent and
 * Good both read as "good" (green), matching this scale's fixed 4 steps
 * rather than inventing a 5th hue for a 5-label scale. */
export function statusColor(status: PerformanceStatus): string {
  switch (status) {
    case "Excellent":
    case "Good":
      return "#0ca30c";
    case "Average":
      return "#fab219";
    case "Needs Attention":
      return "#ec835a";
    case "Critical":
      return "#d03b3b";
  }
}
