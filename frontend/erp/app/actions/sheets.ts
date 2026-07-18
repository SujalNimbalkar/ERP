"use server";

import { unstable_cache, updateTag } from "next/cache";
import { gasConfigured, gasPost } from "@/lib/server/gas";
import { readSession, sessionAllowed } from "@/lib/server/auth";
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
export type UploadResult = { success: boolean; url?: string; message?: string };

const NOT_CONFIGURED: MutationResult = {
  success: false,
  message: "Google Sheets is not configured.",
};
// Defense in depth: proxy.ts already redirects signed-out page loads, but
// these actions are the real mutation surface, so each one re-checks the
// session itself (no-op until the auth env vars are configured).
const NOT_SIGNED_IN: MutationResult = { success: false, message: "Not signed in." };
const INVALID: MutationResult = { success: false, message: "Invalid request." };
const FAILED: MutationResult = {
  success: false,
  message: "Google Sheets request failed.",
};

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
// ~1.5MB decoded — generous for a text/table dialog screenshot, base64
// inflates that to roughly this many characters.
const MAX_IMAGE_BASE64_LENGTH = 2_000_000;

/** The session email, server-verified — "" until auth is configured. Sent
 * with every mutation so audit rows record who made the change; never taken
 * from the client, so it can't be spoofed. */
async function sessionUser(): Promise<string> {
  return (await readSession())?.email ?? "";
}

function listTags(types?: string[]): string[] {
  return types && types.length
    ? ["sheets:all", ...types.map((t) => `sheet:${t}`)]
    : ["sheets:all"];
}

export async function listSheets(types?: string[]): Promise<ListResult> {
  if (!(await sessionAllowed())) return NOT_SIGNED_IN;
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
  if (!(await sessionAllowed())) return NOT_SIGNED_IN;
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
      user: await sessionUser(),
    });
    if (result.success) expireType(type);
    return { success: !!result.success, message: result.message ?? "" };
  } catch (err) {
    console.error("appendRows failed:", err);
    return FAILED;
  }
}

export async function upsertRow(type: string, data: Row): Promise<MutationResult> {
  if (!(await sessionAllowed())) return NOT_SIGNED_IN;
  if (!gasConfigured()) return NOT_CONFIGURED;
  if (!isValidType(type) || !isFlatRecord(data)) return INVALID;
  try {
    const user = await sessionUser();
    // Audit rows carry the author in the row itself — overwrite whatever the
    // client put there with the server-verified identity.
    const stamped = type === "audit" && user ? { ...data, user } : data;
    const result = await gasPost<MutationResult>({ action: "upsert", type, data: stamped, user });
    if (result.success) expireType(type);
    return { success: !!result.success, message: result.message ?? "" };
  } catch (err) {
    console.error("upsertRow failed:", err);
    return FAILED;
  }
}

export async function deleteRow(type: string, id: string): Promise<MutationResult> {
  if (!(await sessionAllowed())) return NOT_SIGNED_IN;
  if (!gasConfigured()) return NOT_CONFIGURED;
  if (!isValidType(type) || typeof id !== "string" || !id || id.length > 200) {
    return INVALID;
  }
  try {
    const result = await gasPost<MutationResult>({ action: "delete", type, id, user: await sessionUser() });
    if (result.success) expireType(type);
    return { success: !!result.success, message: result.message ?? "" };
  } catch (err) {
    console.error("deleteRow failed:", err);
    return FAILED;
  }
}

/**
 * Uploads a receipt image (auto-captured from the Cargo Confirm & Save
 * dialog) to Google Drive via Apps Script — not a sheet row, so it bypasses
 * isValidType/isFlatRecord and gets its own small validation instead.
 * Best-effort by design: callers treat a failure here as "no image this
 * time," never as a reason to block the trip save itself.
 */
export async function uploadTripReceipt(
  base64Data: string,
  filename: string,
  mimeType: string
): Promise<UploadResult> {
  if (!(await sessionAllowed())) return NOT_SIGNED_IN;
  if (!gasConfigured()) return { success: false, message: "Google Sheets is not configured." };
  if (
    !ALLOWED_IMAGE_MIME_TYPES.has(mimeType) ||
    typeof base64Data !== "string" ||
    base64Data.length === 0 ||
    base64Data.length > MAX_IMAGE_BASE64_LENGTH
  ) {
    return { success: false, message: "Invalid image." };
  }
  try {
    const result = await gasPost<UploadResult>({
      action: "uploadImage",
      base64Data,
      filename,
      mimeType,
    });
    return { success: !!result.success, url: result.url, message: result.message };
  } catch (err) {
    console.error("uploadTripReceipt failed:", err);
    return { success: false, message: "Upload failed." };
  }
}
