import "server-only";

/**
 * The only place in the codebase that talks to the Google Apps Script web
 * app. `server-only` makes importing this from a client component a build
 * error, so the URL and token can never leak into the browser bundle.
 *
 * Both env vars are server-side (no NEXT_PUBLIC_ prefix): set them in
 * `.env.local` for dev and in the Vercel project settings for production.
 */
const GAS_URL = process.env.GAS_WEB_APP_URL ?? "";
const GAS_TOKEN = process.env.GAS_API_TOKEN ?? "";

export function gasConfigured(): boolean {
  return !!GAS_URL;
}

/**
 * POSTs a JSON body to Apps Script with the shared token attached.
 * text/plain matches what GAS's doPost expects (e.postData.contents), and
 * fetch follows GAS's 302-to-content redirect by default. GAS always
 * responds 200 — success/failure lives in the JSON `success` flag, which
 * callers must check.
 */
export async function gasPost<T>(body: Record<string, unknown>): Promise<T> {
  if (!GAS_URL) throw new Error("GAS_WEB_APP_URL is not configured");
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, token: GAS_TOKEN }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GAS request failed (${res.status})`);
  return (await res.json()) as T;
}
