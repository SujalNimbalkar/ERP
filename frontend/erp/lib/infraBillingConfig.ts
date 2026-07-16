import { getAllInfraBills } from "./billingStore";

/**
 * Infra & Crusher billing master data. Companies (the issuing entity) are
 * shared with Cargo billing — see ./companies. Client/project defaults live
 * in ./clientStore, not here, since they're maintained from the Infra &
 * Crusher entry form rather than the billing screen itself.
 */

export { COMPANIES, findCompany, type CompanyProfile } from "./companies";

export const INFRA_GST_PERCENT_DEFAULT = 5;

/**
 * Reuses the HSN/SAC code last entered for this material type on a saved
 * Infra bill, so a recurring material (e.g. "Plaster Sand" -> 251710)
 * doesn't need retyping every month. Falls back to blank — deliberately not
 * hardcoding a materialType -> HSN table here since the correct tax code
 * depends on the actual product and shouldn't be guessed.
 */
export function suggestHsnForMaterial(materialType: string): string {
  const wanted = materialType.trim().toLowerCase();
  if (!wanted) return "";
  const match = getAllInfraBills().find(
    (b) => b.materialType.trim().toLowerCase() === wanted && b.hsnNo.trim()
  );
  return match?.hsnNo ?? "";
}
