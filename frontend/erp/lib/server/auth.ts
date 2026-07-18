import "server-only";

import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { SESSION_COOKIE, verifySessionJwt, type SessionData } from "@/lib/authShared";

/**
 * Firebase email/password sign-in with admin-provisioned accounts — users
 * can't register themselves; the admin creates each account in the Firebase
 * console (Authentication → Users → Add user) and hands out the
 * credentials. The password exchange happens entirely server-side against
 * Firebase's Identity Toolkit REST API, so the browser never loads a
 * Firebase SDK and the API key never ships to the client.
 *
 * Like cloud sync (gasConfigured), auth only enforces once its env vars
 * exist, so the app keeps working before the one-time Firebase setup:
 *
 *   FIREBASE_API_KEY  the Firebase project's Web API key (server-only here)
 *   AUTH_SECRET       32+ random bytes; signs the session cookie
 */

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function authConfigured(): boolean {
  return !!(process.env.AUTH_SECRET && process.env.FIREBASE_API_KEY);
}

/** Firebase error codes that mean "wrong credentials", kept vague for the user on purpose. */
const CREDENTIAL_ERRORS = new Set([
  "EMAIL_NOT_FOUND",
  "INVALID_PASSWORD",
  "INVALID_LOGIN_CREDENTIALS",
]);

export type FirebaseSignInResult =
  | { success: true; session: SessionData }
  | { success: false; message: string };

/**
 * Exchanges email + password with Firebase. The response comes straight
 * from Google over TLS using our API key, so its identity claims are
 * trusted directly — no separate ID-token verification step needed.
 */
export async function firebaseSignIn(
  email: string,
  password: string
): Promise<FirebaseSignInResult> {
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        cache: "no-store",
      }
    );
  } catch {
    return { success: false, message: "Couldn't reach the sign-in service. Try again." };
  }

  type SignInResponse = {
    email?: string;
    displayName?: string;
    error?: { message?: string };
  };
  let json: SignInResponse;
  try {
    json = (await response.json()) as SignInResponse;
  } catch {
    return { success: false, message: "Sign-in failed. Try again." };
  }

  if (!response.ok || !json.email) {
    const code = json.error?.message ?? "";
    if (CREDENTIAL_ERRORS.has(code)) {
      return { success: false, message: "Incorrect email or password." };
    }
    if (code === "USER_DISABLED") {
      return { success: false, message: "This account has been disabled." };
    }
    if (code.startsWith("TOO_MANY_ATTEMPTS_TRY_LATER")) {
      return { success: false, message: "Too many attempts — wait a bit and try again." };
    }
    console.error("firebaseSignIn failed:", code || response.status);
    return { success: false, message: "Sign-in failed. Try again." };
  }

  return {
    success: true,
    session: {
      email: json.email.toLowerCase(),
      name: json.displayName ?? "",
      // Everyone is admin today; the field exists so per-role module gating
      // can be added later without re-issuing sessions.
      role: "admin",
    },
  };
}

export async function createSessionJwt(session: SessionData): Promise<string> {
  return new SignJWT({ email: session.email, name: session.name, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

/** The signed-in user, or null when there's no valid session cookie (or auth isn't configured). */
export async function readSession(): Promise<SessionData | null> {
  if (!authConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionJwt(token, process.env.AUTH_SECRET!);
}

/**
 * The gate server actions use: true when auth isn't configured yet (open by
 * design, matching gasConfigured's pattern) or the caller has a valid
 * session.
 */
export async function sessionAllowed(): Promise<boolean> {
  if (!authConfigured()) return true;
  return (await readSession()) !== null;
}
