import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import {
  listConversationsForPeriod,
  upsertMemoryDigest,
  updateDigestEmbedding,
} from "@/lib/tenant-config/repository";
import { generateDigestSummary } from "@/lib/db/digest";
import { generateEmbedding } from "@/lib/db/embeddings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "admin");
  if (!access.ok) return access.response;

  let body: { periodStart?: string; periodEnd?: string; digestType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません" }, { status: 400 });
  }

  const periodStart = typeof body.periodStart === "string" ? body.periodStart.trim() : "";
  const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd.trim() : "";
  const digestType = typeof body.digestType === "string" ? body.digestType.trim() : "weekly";

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ ok: false, message: "periodStart と periodEnd は必須です（例: 2026-05-01）" }, { status: 400 });
  }

  const from = new Date(`${periodStart}T00:00:00.000Z`);
  const to = new Date(`${periodEnd}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return NextResponse.json({ ok: false, message: "periodStart / periodEnd の日付形式が不正です" }, { status: 400 });
  }

  const conversations = await listConversationsForPeriod({ tenantKey: access.tenant, from, to });
  if (conversations.length === 0) {
    return NextResponse.json({ ok: false, message: "指定期間に会話ログがありません" }, { status: 404 });
  }

  const summary = await generateDigestSummary({ conversations, periodStart, periodEnd });
  const digestId = await upsertMemoryDigest({
    tenantKey: access.tenant,
    periodStart,
    periodEnd,
    digestType,
    summary,
    sourceCount: conversations.length,
  });

  // embedding は非同期で保存（失敗してもダイジェスト本体には影響させない）
  void generateEmbedding(summary)
    .then((emb) => (emb ? updateDigestEmbedding(digestId, emb) : Promise.resolve()))
    .catch((err) => console.error("[generate-digest] embedding save failed:", err));

  return NextResponse.json({
    ok: true,
    digestId,
    tenant: access.tenant,
    periodStart,
    periodEnd,
    digestType,
    sourceCount: conversations.length,
    summary,
  });
}
