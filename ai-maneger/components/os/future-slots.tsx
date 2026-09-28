import { FUTURE_SLOTS } from "@/lib/os/panel-registry";
import { OsCard, PhasePlaceholder } from "./ui";

export function FutureSlots() {
  return (
    <OsCard id="future" icon="🧱" title="将来枠（これから追加する機能）" description="lib/os/panel-registry.ts の FUTURE_SLOTS に追加すると、ここに表示されます。実装できたら専用のセクションに置き換え。">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {FUTURE_SLOTS.map((s) => (
          <PhasePlaceholder key={s.key} title={s.title} phase={s.phase} description={s.description} />
        ))}
      </div>
    </OsCard>
  );
}
