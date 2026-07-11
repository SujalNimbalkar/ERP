/** Material master — codes, names, and weight per piece (kg). */
export interface MaterialMasterEntry {
  id: string;
  code: string;
  name: string;
  /** Weight per piece in kg — blank in source sheet means manual entry */
  weightPerPieceKg?: number;
  /** Flat transport rate in Rs/kg — overrides weight-tier pricing when set */
  ratePerKg?: number;
}

export const MATERIAL_MASTER: MaterialMasterEntry[] = [
  { id: "7000913-aae-block", code: "7000913", name: "AAE Block", weightPerPieceKg: 2.613 },
  { id: "6002581-cnc-hmcl-backa-black", code: "6002581", name: "CNC casting HMCL-BACKA Black", weightPerPieceKg: 2.613 },
  { id: "6002666-cnc-aaee-silver", code: "6002666", name: "CNC casting AAEE silver", weightPerPieceKg: 2.63 },
  { id: "7001249-cyl-block-ff", code: "7001249", name: "cyl Block FF", weightPerPieceKg: 2.516 },
  { id: "7001005-cylinder-block", code: "7001005", name: "cylinder block", weightPerPieceKg: 2.517 },
  { id: "6000362-pmc-casting", code: "6000362", name: "PMC casting", weightPerPieceKg: 2.15 },
  { id: "6000335-black-painted-casting", code: "6000335", name: "Black Painted Casting", weightPerPieceKg: 3.396 },
  { id: "6003811-black-powder-coating", code: "6003811", name: "Black Powder Coating Casting", weightPerPieceKg: 3.396 },
  { id: "6000923-painted-tvs-block", code: "6000923", name: "Painted casting TVS block", weightPerPieceKg: 3.013 },
  { id: "7000892-ack-cylinder-block", code: "7000892", name: "Ack cylinder block", weightPerPieceKg: 2.613 },
  { id: "7000961-liner-cyl-barrel-ii", code: "7000961", name: "Liner CYL Barrel II", weightPerPieceKg: 0.964 },
  { id: "9508642-family-scm", code: "9508642", name: "Family SCM" },
  { id: "9508737-2-cavity-cap", code: "9508737", name: "2 cavity cap" },
  { id: "6002581-cnc-casting", code: "6002581", name: "CNC casting" },
  { id: "6002593-raw-casting-kopa", code: "6002593", name: "Raw casting Kopa", weightPerPieceKg: 2.42 },
  { id: "6003915-pow-casting", code: "6003915", name: "Pow casting", weightPerPieceKg: 2.88 },
  { id: "9507342-boxes-pattern", code: "9507342", name: "Boxes & Pattern (Group Component)", weightPerPieceKg: 2000 },
  { id: "9507231-boxes-pattern", code: "9507231", name: "Boxes & Pattern (Group Component)", weightPerPieceKg: 2000 },
  { id: "9507347-boxes-pattern", code: "9507347", name: "Boxes & Pattern (Group Component)", weightPerPieceKg: 2000 },
  { id: "9508292-boxes-pattern", code: "9508292", name: "Boxes & Pattern (Group Component)", weightPerPieceKg: 2000 },
  { id: "6002365-casting-component", code: "6002365", name: "Casting Component", weightPerPieceKg: 2.201 },
  { id: "6001726-casting-component", code: "6001726", name: "Casting Component", weightPerPieceKg: 2.018 },
  { id: "7001295-casting-component", code: "7001295", name: "Casting Component", weightPerPieceKg: 0.96 },
  { id: "9508507-empty-palate", code: "9508507", name: "empty Palate", weightPerPieceKg: 54.5 },
  { id: "7001170-kolh-sleeve-cylinder", code: "7001170", name: "KOLH-Sleeve cylinder", weightPerPieceKg: 0.55 },
  { id: "7001185-rear-hub-rat", code: "7001185", name: "Rear Hub Rat", weightPerPieceKg: 0.94 },
  { id: "7000941-housing", code: "7000941", name: "Housing", weightPerPieceKg: 3.42 },
  { id: "7000997-sleeve-cylinder", code: "7000997", name: "sleeve cylinder", weightPerPieceKg: 0.92 },
  { id: "7000914-aann-hmcl-spiny-liner", code: "7000914", name: "AANN HMCL-Spiny liner", weightPerPieceKg: 0.6 },
  { id: "6001679-cnc-casting-hmcl", code: "6001679", name: "CNC casting HMCL", weightPerPieceKg: 2.66 },
  { id: "6001167-cnc-black-painted-casting", code: "6001167", name: "CNC black Painted casting", weightPerPieceKg: 2.82 },
  { id: "7000965-cylinder-block", code: "7000965", name: "Cylinder block", weightPerPieceKg: 2.5 },
  { id: "7000995-cyl-block-fully-finished", code: "7000995", name: "CYL Block fully finished", weightPerPieceKg: 2.6 },
  { id: "6002371-heat-treated-casting", code: "6002371", name: "Heat treated casting", weightPerPieceKg: 5.1 },
  { id: "6000283-fettled-casting", code: "6000283", name: "Fettled Casting", weightPerPieceKg: 2.87 },
  { id: "6001167-cnc-black-painted", code: "6001167", name: "CNC Black painted", weightPerPieceKg: 2.82 },
  { id: "6002687-painted-casting-tvs", code: "6002687", name: "Painted casting TVS", weightPerPieceKg: 3.5 },
  { id: "6000335-black-painted-casting-2", code: "6000335", name: "Black Painted casting", weightPerPieceKg: 3.304 },
  { id: "6003531-only-boring-black-painted", code: "6003531", name: "Only Boring Black Painted casting", weightPerPieceKg: 3.005 },
  { id: "6002817-kwpg", code: "6002817", name: "KWPG", weightPerPieceKg: 2.68 },
  { id: "6002818-kopa", code: "6002818", name: "KOPA", weightPerPieceKg: 2.34 },
  { id: "7000055-black-painted-sf", code: "7000055", name: "Black Painted s/f" },
  { id: "6002594-fettled-casting-kopa-bk", code: "6002594", name: "Fettled casting kopa BK", weightPerPieceKg: 1.97 },
  { id: "7000680-cylinder-sozai-kwpg", code: "7000680", name: "Cylinder SOZAI KWPG", weightPerPieceKg: 2.29 },
  { id: "burn-sand", code: "9700062", name: "Burn Sand", ratePerKg: 0.60 },
  { id: "reclaimed-sand", code: "RSAND", name: "Reclaimed Sand", ratePerKg: 0.35 },
  { id: "resin-coated-sand", code: "6000436", name: "Resin Coated Sand", ratePerKg: 1.10 },
];

export const MATERIAL_SELECT_OPTIONS = MATERIAL_MASTER.map((m) => ({
  value: m.id,
  label: `${m.code} — ${m.name}`,
}));

export function findMaterialById(id: string): MaterialMasterEntry | undefined {
  return MATERIAL_MASTER.find((m) => m.id === id);
}

export function findMaterialByCode(code: string): MaterialMasterEntry | undefined {
  const normalized = code.trim();
  return MATERIAL_MASTER.find((m) => m.code === normalized);
}

/** Trip weight thresholds for transport pricing */
export const CARGO_RATE_LOW_MAX_KG = 5500;
export const CARGO_RATE_MID_MAX_KG = 9000;
export const CARGO_RATE_MID = 0.74;
export const CARGO_RATE_ABOVE_THRESHOLD = 0.72;
export const CARGO_RATE_UPTO_THRESHOLD = 0.78;

export interface CargoTransportCalc {
  transportRate: number;
  transportAmount: number;
  rateTier: string;
}

/** Transport charge from total trip weight (kg) */
export function calcCargoTransportByWeight(totalWtKg: number): CargoTransportCalc | null {
  if (!totalWtKg || totalWtKg <= 0) return null;

  const transportRate =
    totalWtKg < CARGO_RATE_LOW_MAX_KG
      ? CARGO_RATE_UPTO_THRESHOLD
      : totalWtKg <= CARGO_RATE_MID_MAX_KG
        ? CARGO_RATE_MID
        : CARGO_RATE_ABOVE_THRESHOLD;
  const transportAmount = Math.round(totalWtKg * transportRate * 100) / 100;

  return {
    transportRate,
    transportAmount,
    rateTier:
      totalWtKg < CARGO_RATE_LOW_MAX_KG
        ? `Below 5.5 tons — Rs ${transportRate}/kg`
        : totalWtKg <= CARGO_RATE_MID_MAX_KG
          ? `5.5 to 9 tons — Rs ${transportRate}/kg`
          : `Above 9 tons — Rs ${transportRate}/kg`,
  };
}
