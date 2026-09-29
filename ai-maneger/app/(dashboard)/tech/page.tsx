import { headers } from "next/headers";
import { TechDashboard } from "@/components/tech/tech-dashboard";
import { loadTechNews } from "@/lib/tech-news/collect";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "テックニュース",
};

function ingestUrl() {
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "localhost:3002";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return `${proto}://${host}/api/tech/ingest`;
}

export default async function TechNewsPage() {
  const snapshot = await loadTechNews({ refreshIfStale: true });
  return <TechDashboard initial={snapshot} ingestUrl={ingestUrl()} />;
}
