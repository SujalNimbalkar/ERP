/**
 * The signed-in user's email, seeded synchronously by AppChrome from the
 * server-verified session (same pattern as lib/storageMode). Client-side
 * convenience only — the server actions re-derive the email from the session
 * cookie themselves and overwrite whatever the client sends, so this value
 * is for local display (offline audit cache), never a trust anchor.
 */

let sessionUserEmail = "";

export function setSessionUser(email: string) {
  sessionUserEmail = email;
}

export function getSessionUser(): string {
  return sessionUserEmail;
}
