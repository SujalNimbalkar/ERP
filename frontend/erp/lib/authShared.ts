import { jwtVerify } from "jose";

/**
 * The pieces of the auth layer that proxy.ts (which can't import
 * "server-only" modules) shares with lib/server/auth.ts. Nothing here
 * touches env vars or cookies itself — callers pass the secret in.
 */

export const SESSION_COOKIE = "sahyadri_session";

export interface SessionData {
  email: string;
  name: string;
  /** Everyone is "admin" today; carried in the session so per-role module gating can be added later without re-issuing sessions. */
  role: string;
}

/** Verifies our own HS256 session JWT. Returns null for anything invalid or expired — never throws. */
export async function verifySessionJwt(
  token: string,
  secret: string
): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (typeof payload.email !== "string" || !payload.email) return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      role: typeof payload.role === "string" && payload.role ? payload.role : "admin",
    };
  } catch {
    return null;
  }
}
