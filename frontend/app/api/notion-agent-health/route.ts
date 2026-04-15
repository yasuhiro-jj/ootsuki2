import { NextResponse } from 'next/server';
import { getConfig, verifyNotionIntegrationToken } from '@/lib/notion-agent/client';

export const runtime = 'nodejs';

async function tryListAgents(cfg: ReturnType<typeof getConfig>) {
  if (!cfg.token) return { ok: false, status: 0, message: 'token missing', agents: [] };
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/agents`, {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Notion-Version': cfg.notionVersion,
      },
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      return { ok: false, status: res.status, message: data?.message ?? text, agents: [] };
    }
    const agents = (data.results ?? []).map((a: any) => ({ id: a.id, name: a.name }));
    return { ok: true, status: res.status, message: null, agents };
  } catch (e: any) {
    return { ok: false, status: 0, message: e.message, agents: [] };
  }
}

/**
 * 開発用: トークン・Agents API の状況を一括診断。
 * ブラウザで GET /api/notion-agent-health を開く。
 */
export async function GET() {
  const cfg = getConfig();
  const hasToken = Boolean(cfg.token);
  const hasAgentId = Boolean(cfg.agentId);

  const me = await verifyNotionIntegrationToken();
  const agentList = await tryListAgents(cfg);

  const configuredIdFound = hasAgentId && agentList.agents.some((a: any) => a.id === cfg.agentId);

  return NextResponse.json({
    tokenLoaded: hasToken,
    agentIdLoaded: hasAgentId,
    agentIdValue: hasAgentId ? cfg.agentId : null,
    tokenLength: hasToken ? cfg.token!.length : 0,
    usersMe: me.ok ? 'ok' : 'failed',
    usersMeStatus: me.status,
    agentsList: agentList.ok ? 'ok' : 'failed',
    agentsListStatus: agentList.status,
    agentsListMessage: agentList.message,
    agentsFound: agentList.agents,
    configuredIdFoundInList: configuredIdFound,
    hint: !me.ok
      ? 'トークンが無効です。シークレットを確認し再起動してください。'
      : !agentList.ok
        ? `GET /v1/agents が失敗 (${agentList.status}): ${agentList.message}。このトークンに Agents API の権限がない可能性があります。`
        : agentList.agents.length === 0
          ? 'エージェント一覧は取れたが 0 件です。Custom Agent にこのインテグレーションを接続してください。'
          : !configuredIdFound
            ? `NOTION_AGENT_ID (${cfg.agentId}) が一覧に見つかりません。一覧にある id のいずれかを使ってください。`
            : 'すべて正常です。/agent でチャットが動くはずです。',
  });
}
