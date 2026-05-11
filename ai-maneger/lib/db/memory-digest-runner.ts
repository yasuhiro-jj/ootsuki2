import type { TenantKey } from "@/lib/tenant-config/types";
import {
  listConversationsForPeriod,
  upsertMemoryDigest,
  updateDigestEmbedding,
} from "@/lib/tenant-config/repository";
import { generateDigestSummary } from "@/lib/db/digest";
import { generateEmbedding } from "@/lib/db/embeddings";

export type MemoryDigestOk = {
  ok: true;
  digestId: string;
  sourceCount: number;
  summary: string;
};

export type MemoryDigestErr = {
  ok: false;
  reason: "no_conversations" | "invalid_period";
  message: string;
};

export async function runMemoryDigestGeneration(params: {
  tenantKey: TenantKey;
  periodStart: string;
  periodEnd: string;
  digestType: string;
}): Promise<MemoryDigestOk | MemoryDigestErr> {
  const periodStart = params.periodStart.trim();
  const periodEnd = params.periodEnd.trim();
  const digestType = params.digestType.trim() || "weekly";

  const from = new Date(`${periodStart}T00:00:00.000Z`);
  const to = new Date(`${periodEnd}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return { ok: false, reason: "invalid_period", message: "periodStart / periodEnd の日付形式が不正です" };
  }

  const conversations = await listConversationsForPeriod({
    tenantKey: params.tenantKey,
    from,
    to,
  });
  if (conversations.length === 0) {
    return {
      ok: false,
      reason: "no_conversations",
      message: "指定期間に会話ログがありません",
    };
  }

  const summary = await generateDigestSummary({
    conversations,
    periodStart,
    periodEnd,
  });
  const digestId = await upsertMemoryDigest({
    tenantKey: params.tenantKey,
    periodStart,
    periodEnd,
    digestType,
    summary,
    sourceCount: conversations.length,
  });

  void generateEmbedding(summary)
    .then((emb) => (emb ? updateDigestEmbedding(digestId, emb) : Promise.resolve()))
    .catch((err) => console.error("[memory-digest] embedding save failed:", err));

  return {
    ok: true,
    digestId,
    sourceCount: conversations.length,
    summary,
  };
}
