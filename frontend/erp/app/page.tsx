import { ClientShell } from "@/components/layout/ClientShell";

export default function Home() {
  const cloudSync = !!process.env.GAS_WEB_APP_URL;
  return <ClientShell cloudSync={cloudSync} />;
}
