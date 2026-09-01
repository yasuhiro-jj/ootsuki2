import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { createPageInDatabase, queryDatabaseAll, updatePage } from "@/lib/notion/client";

export const runtime = "nodejs";

interface HourlyEntry {
  hour: string;
  value: number;
}

interface SaveTimeZoneSalesBody {
  target?: string;
  source?: string;
  total?: number;
  hourlyTotals?: HourlyEntry[];
  peakHours?: HourlyEntry[];
  month?: string;
}

function timeZoneSalesDbId(): string {
  return (process.env.NOTION_OOTSUKI_TIME_ZONE_SALES_DB_ID || "").trim();
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  const dbId = timeZoneSalesDbId();
  if (!dbId) {
    return NextResponse.json({ ok: false, message: "時間帯別売上DBが未設定です。" }, { status: 503 });
  }

  let body: SaveTimeZoneSalesBody;
  try {
    body = (await request.json()) as SaveTimeZoneSalesBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSONの形式が正しくありません。" }, { status: 400 });
  }

  const target = body.target === "客数" ? "客数" : "売上";
  const source = body.source === "POS" ? "POS" : "USEN";
  const total = typeof body.total === "number" && Number.isFinite(body.total) ? body.total : 0;
  const hourlyTotals = Array.isArray(body.hourlyTotals) ? body.hourlyTotals : [];
  const peakHours = Array.isArray(body.peakHours) ? body.peakHours : [];

  if (hourlyTotals.length === 0) {
    return NextResponse.json({ ok: false, message: "時間帯別データがありません。先にCSVを読み込んでください。" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(body.month || "") ? (body.month as string) : today.slice(0, 7);
  const label = `${month} ${source} ${target}`;
  const peakText = peakHours.length > 0 ? peakHours.map((p) => `${p.hour}(${Math.round(p.value)})`).join(", ") : "-";

  const properties = {
    "営業日ラベル": { title: [{ text: { content: label } }] },
    "営業日": { date: { start: today } },
    "対象": { select: { name: target } },
    "ソース": { select: { name: source } },
    "対象月": { rich_text: [{ text: { content: month } }] },
    "合計": { number: total },
    "ピーク時間帯": { rich_text: [{ text: { content: peakText } }] },
    "時間帯別内訳JSON": { rich_text: [{ text: { content: JSON.stringify(hourlyTotals) } }] },
  };

  try {
    // 同じ対象月・対象・ソースの組み合わせが既にあれば上書き更新し、再アップロードのたびに重複が積み上がらないようにする。
    const existingPages = await queryDatabaseAll(dbId, {
      filter: {
        and: [
          { property: "対象月", rich_text: { equals: month } },
          { property: "対象", select: { equals: target } },
          { property: "ソース", select: { equals: source } },
        ],
      },
    }).catch(() => []);

    let pageUrl = "";
    let pageId = "";
    if (existingPages[0]) {
      const updated = await updatePage(existingPages[0].id, { properties });
      pageUrl = updated.url || "";
      pageId = existingPages[0].id;
    } else {
      const created = await createPageInDatabase(dbId, properties);
      pageUrl = created.url || "";
      pageId = created.id;
    }

    await logTenantAudit(request, access, {
      action: "time_zone_sales.save",
      resourceType: "time-zone-sales",
      resourceId: pageId,
      metadata: { target, source, total, month },
    });

    return NextResponse.json({ ok: true, pageUrl });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "保存に失敗しました。" },
      { status: 500 },
    );
  }
}
