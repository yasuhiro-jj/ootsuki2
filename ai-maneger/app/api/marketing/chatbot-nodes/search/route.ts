import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { findChatbotNodesByName, isChatbotIntegrationConfigured } from "@/lib/marketing/chatbot-integration";

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  if (!isChatbotIntegrationConfigured()) {
    return NextResponse.json({ ok: false, message: "チャットボット連携が未設定です。", nodes: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 1) {
    return NextResponse.json({ ok: true, nodes: [] });
  }

  try {
    const nodes = await findChatbotNodesByName(query);
    return NextResponse.json({ ok: true, nodes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error), nodes: [] },
      { status: 502 },
    );
  }
}
