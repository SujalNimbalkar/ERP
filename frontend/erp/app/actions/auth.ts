"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/authShared";
import {
  authConfigured,
  createSessionJwt,
  firebaseSignIn,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/auth";

export type LoginResult = { success: boolean; message?: string };

/**
 * Signs in with an admin-provisioned Firebase email/password account and
 * sets the session cookie. The credential check happens server-side against
 * Firebase's REST API (see lib/server/auth.ts).
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<LoginResult> {
  if (!authConfigured()) {
    return { success: false, message: "Sign-in is not configured on this server." };
  }
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password ||
    email.length > 200 ||
    password.length > 200
  ) {
    return { success: false, message: "Enter your email and password." };
  }
  const result = await firebaseSignIn(email.trim(), password);
  if (!result.success) return { success: false, message: result.message };

  (await cookies()).set(SESSION_COOKIE, await createSessionJwt(result.session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return { success: true };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
