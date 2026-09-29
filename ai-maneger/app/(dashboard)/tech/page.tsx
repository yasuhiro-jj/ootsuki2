import { TechDashboard } from "@/components/tech/tech-dashboard";
import { loadTechNewsFromNotion } from "@/lib/tech-news/notion";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "テックニュース",
};

export default async function TechNewsPage() {
  const snapshot = await loadTechNewsFromNotion();
  return <TechDashboard initial={snapshot} />;
}
