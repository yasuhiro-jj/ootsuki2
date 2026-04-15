import { recommendedAgents } from "@/lib/agents";

export function RecommendedAgentList() {
  return (
    <div className="grid gap-3">
      {recommendedAgents.map((agent) => (
        <article
          key={agent.name}
          className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4"
        >
          <h4 className="font-semibold text-stone-900">{agent.name}</h4>
          <p className="mt-1 text-sm leading-7 text-stone-600">{agent.role}</p>
        </article>
      ))}
    </div>
  );
}
