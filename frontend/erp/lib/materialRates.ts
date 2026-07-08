export type MaterialUom = "KG" | "EA" | "Brass";

export interface MaterialRate {
  id: string;
  label: string;
  code: string;
  description: string;
  uom: MaterialUom;
  /** Normal transport rate per unit (Rs per Kg, EA, or Brass) */
  standardRate: number;
  /** Below this qty (same unit as uom), partial rate applies — e.g. 20000 = 20 tons in KG */
  partialThreshold?: number;
  /** Rate when load is below partialThreshold — e.g. Burn Sand: Rs 1/Kg if under 20 tons */
  partialRate?: number;
}

export const MATERIAL_RATES: MaterialRate[] = [
  {
    id: "burn-sand",
    label: "Burn Sand",
    code: "9700062",
    description: "Burn Sand",
    uom: "KG",
    standardRate: 0.9,
    partialThreshold: 20000,
    partialRate: 1,
  },
  {
    id: "resin-coated-sand",
    label: "Resin Coated Sand",
    code: "68159990",
    description: "Resin Coated Sand 18/28/65",
    uom: "KG",
    standardRate: 0.9,
    partialThreshold: 20000,
    partialRate: 1,
  },
  {
    id: "castings",
    label: "Castings (EA)",
    code: "6001167",
    description: "CNC Painted Casting",
    uom: "EA",
    standardRate: 0.5,
    partialThreshold: 500,
    partialRate: 0.75,
  },
  {
    id: "empty-pallet",
    label: "Empty Pallet",
    code: "9508507",
    description: "Empty Pallet Return",
    uom: "EA",
    standardRate: 0,
    partialThreshold: undefined,
    partialRate: undefined,
  },
];

export function findMaterialRate(id: string): MaterialRate | undefined {
  return MATERIAL_RATES.find((m) => m.id === id);
}

export interface TransportCalcResult {
  transportRate: number;
  transportAmount: number;
  rateTier: "Standard" | "Partial";
  billableQty: number;
}

/** Calculate transport charge from material rate card */
export function calcTransportAmount(
  materialId: string,
  quantity: number,
  totalWt: number,
  uom: string
): TransportCalcResult | null {
  const material = findMaterialRate(materialId);
  if (!material || !quantity) return null;

  const billableQty =
    material.uom === "KG"
      ? totalWt > 0
        ? totalWt
        : quantity
      : quantity;

  const isPartial =
    material.partialThreshold !== undefined &&
    material.partialRate !== undefined &&
    billableQty < material.partialThreshold;

  const transportRate = isPartial ? material.partialRate! : material.standardRate;
  const transportAmount = Math.round(billableQty * transportRate * 100) / 100;

  return {
    transportRate,
    transportAmount,
    rateTier: isPartial ? "Partial" : "Standard",
    billableQty,
  };
}
