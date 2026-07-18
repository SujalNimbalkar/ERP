import type { Metadata } from "next";
import { ModuleClient } from "@/components/layout/moduleRegistry";

export const metadata: Metadata = { title: "Material Master – Sahyadri ERP" };

export default function Page() {
  return <ModuleClient id="materials" />;
}
