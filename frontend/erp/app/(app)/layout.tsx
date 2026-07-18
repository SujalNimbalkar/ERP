import { ChromeBoundary } from "@/components/layout/ChromeBoundary";
import { readSession } from "@/lib/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The GAS URL is server-only; the layout computes the yes/no flag here and
  // the chrome seeds it into lib/storageMode for the whole client session.
  const cloudSync = !!process.env.GAS_WEB_APP_URL;
  // Null until auth is configured — the sidebar simply omits its account
  // footer then. proxy.ts guarantees a session exists once auth is on.
  const session = await readSession();
  return (
    <ChromeBoundary cloudSync={cloudSync} sessionEmail={session?.email ?? ""}>
      {children}
    </ChromeBoundary>
  );
}
