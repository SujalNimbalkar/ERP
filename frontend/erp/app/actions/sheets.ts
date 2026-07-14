"use server";

import { unstable_cache, updateTag } from "next/cache";
import { gasConfigured, gasPost } from "@/lib/server/gas";
import { isFlatRecord, isValidType, MAX_BATCH } from "@/lib/server/validate";

/**
 * The secure API layer: every byte between the browser and Google Apps
 * Script flows through these server actions. The GAS URL + token live only
 * on the server (lib/server/gas.ts); the client libs (lib/api.ts,
 * lib/sheetFetch.ts, lib/dieselUtils.ts) call these instead of fetch().
 *
 * List reads are cached per requested-type-set for 60s and tagged; every
 * mutation expires the affected tags with updateTag(), so a device sees its
 * own writes immediately and other devices lag at most a minute.
 */

type Row = Record<string, string | number>;

export type ListResult = {
  success: boolean;
  message?: string;
  data?: Record<string, Row[]>;
  /** Human-readable tab names not found in the spreadsheet. */
  missing?: string[];
  /** Type keys whose tab wasn't found — client keeps its local cache for these. */
  missingTypes?: string[];
};

export type MutationResult = { success: boolean; message: string };

const NOT_CONFIGURED: MutationResult = {
  success: false,
  message: "Google Sheets is not configured.",
};
const INVALID: MutationResult = { success: false, message: "Invalid request." };
const FAILED: MutationResult = {
  success: false,
  message: "Google Sheets request failed.",
};

function listTags(types?: string[]): string[] {
  return types && types.length
    ? ["sheets:all", ...types.map((t) => `sheet:${t}`)]
    : ["sheets:all"];
}

export async function listSheets(types?: string[]): Promise<ListResult> {
  if (!gasConfigured()) return NOT_CONFIGURED;
  if (types !== undefined) {
    if (!Array.isArray(types) || types.length === 0 || !types.every(isValidType)) {
      return INVALID;
    }
  }
  const key = types ? [...types].sort().join(",") : "all";
  const cached = unstable_cache(
    () =>
      gasPost<ListResult>({
        action: "list",
        ...(types ? { type: types } : {}),
      }),
    ["gas-list", key],
    { revalidate: 60, tags: listTags(types) }
  );
  try {
    return await cached();
  } catch (err) {
    console.error("listSheets failed:", err);
    return FAILED;
  }
}

/** Expire every cache entry a mutation on `type` can affect. The server
 * also appends an audit row on each mutation, so the audit list is expired
 * alongside. */
function expireType(type: string) {
  updateTag("sheets:all");
  updateTag(`sheet:${type}`);
  updateTag("sheet:audit");
}

export async function appendRows(
  type: string,
  records: Row[]
): Promise<MutationResult> {
  if (!gasConfigured()) return NOT_CONFIGURED;
  if (
    !isValidType(type) ||
    !Array.isArray(records) ||
    records.length === 0 ||
    records.length > MAX_BATCH ||
    !records.every(isFlatRecord)
  ) {
    return INVALID;
  }
  try {
    const result = await gasPost<MutationResult>({
      action: "append",
      type,
      records,
    });
    if (result.success) expireType(type);
    return { success: !!result.success, message: result.message ?? "" };
  } catch (err) {
    console.error("appendRows failed:", err);
    return FAILED;
  }
}

export async function upsertRow(type: string, data: Row): Promise<MutationResult> {
  if (!gasConfigured()) return NOT_CONFIGURED;
  if (!isValidType(type) || !isFlatRecord(data)) return INVALID;
  try {
    const result = await gasPost<MutationResult>({ action: "upsert", type, data });
    if (result.success) expireType(type);
    return { success: !!result.success, message: result.message ?? "" };
  } catch (err) {
    console.error("upsertRow failed:", err);
    return FAILED;
  }
}

export async function deleteRow(type: string, id: string): Promise<MutationResult> {
  if (!gasConfigured()) return NOT_CONFIGURED;
  if (!isValidType(type) || typeof id !== "string" || !id || id.length > 200) {
    return INVALID;
  }
  try {
    const result = await gasPost<MutationResult>({ action: "delete", type, id });
    if (result.success) expireType(type);
    return { success: !!result.success, message: result.message ?? "" };
  } catch (err) {
    console.error("deleteRow failed:", err);
    return FAILED;
  }
}
