import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { saveProjectDirection } from "@/lib/notion/decision-memo";
import { requireTenantAccess } from "@/lib/api/tenant-access";

interface ProjectDirectionRequestBody {
  title?: string;
  status?: string;
  summary?: string;
  relatedNumbers?: string;
  nextAction?: string;
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: ProjectDirectionRequestBody;
  try {
    body = (await request.json()) as ProjectDirectionRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません。" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const relatedNumbers = typeof body.relatedNumbers === "string" ? body.relatedNumbers.trim() : "";
  const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";

  if (!summary) {
    return NextResponse.json({ ok: false, message: "方針内容を入力してください。" }, { status: 400 });
  }

  try {
    const noteId = await saveProjectDirection({
      title,
      status,
      summary,
      relatedNumbers,
      nextAction,
    });
    await logTenantAudit(request, access, {
      action: "project_direction.save",
      resourceType: "project-direction",
      resourceId: noteId,
      metadata: { status, hasRelatedNumbers: Boolean(relatedNumbers), hasNextAction: Boolean(nextAction) },
    });
    return NextResponse.json({ ok: true, id: noteId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `プロジェクト方針の保存に失敗しました: ${error.message}`
            : "プロジェクト方針の保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
