import type { Task, TaskEvent } from "@/types/os";
import { jstDateTime } from "@/lib/os/format";
import { OsCard, StateChip } from "./ui";

const ACTOR_ICON: Record<TaskEvent["actorType"], string> = { system: "⚙️", agent: "🤖", user: "👤", grok_bot: "🟠" };

export function TimelinePanel({ events, tasks }: { events: TaskEvent[]; tasks: Task[] }) {
  const running = tasks.filter((t) => t.state === "EXECUTING" || t.state === "APPROVED");
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <OsCard id="timeline" icon="⏱️" title="実行中・実行履歴" description="task_events（追記のみ）から表示。サンプル。">
      <div className="mb-3 space-y-2">
        {running.length ? (
          running.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-600" />
              </span>
              <span className="flex-1 font-semibold text-violet-900">{t.title}</span>
              <StateChip state={t.state} />
            </div>
          ))
        ) : (
          <p className="text-xs text-stone-400">実行中の仕事はありません</p>
        )}
      </div>
      <ol className="relative space-y-3 border-l-2 border-stone-200 pl-4">
        {sorted.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[23px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] ring-2 ring-stone-200">{ACTOR_ICON[e.actorType]}</span>
            <p className="text-[10px] text-stone-400">
              {jstDateTime(e.at)}・{e.actorLabel}
            </p>
            <p className="text-sm font-semibold text-stone-800">{e.taskTitle}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-stone-500">
              {e.fromState ? <StateChip state={e.fromState} /> : null}
              {e.fromState ? <span>→</span> : null}
              <StateChip state={e.toState} />
              {e.note ? <span className="ml-1">{e.note}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </OsCard>
  );
}
