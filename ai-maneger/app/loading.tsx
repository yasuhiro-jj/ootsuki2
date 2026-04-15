import { AppShell } from "@/components/common/app-shell";
import { SectionCard } from "@/components/common/section-card";

export default function Loading() {
  return (
    <AppShell title="読み込み中" description="Notion からデータを取得しています。">
      <SectionCard>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[24px] bg-stone-100"
            />
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
