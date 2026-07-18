import type { Metadata } from "next";
import { ModuleClient } from "@/components/layout/moduleRegistry";

export const metadata: Metadata = { title: "Cargo Transport – Sahyadri ERP" };

export default function Page() {
  return <ModuleClient id="cargo" />;
}
