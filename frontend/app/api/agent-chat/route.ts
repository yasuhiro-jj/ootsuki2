import { NextResponse } from 'next/server';
import { fetchNotionContext, notionContextToText } from '@/lib/notion-agent/notion-db-client';
import { generateReply, type ChatMessage } from '@/lib/notion-agent/openai-chat';
import type { AgentChatErrorResponse, AgentChatRequestBody } from '@/types/chat';

export const runtime = 'nodejs';

const sessionStore = new Map<string, ChatMessage[]>();

function getOrCreateSession(id?: string): { sessionId: string; history: ChatMessage[] } {
  if (id && sessionStore.has(id)) {
    return { sessionId: id, history: sessionStore.get(id)! };
  }
  const sessionId = id || crypto.randomUUID();
  const history: ChatMessage[] = [];
  sessionStore.set(sessionId, history);
  return { sessionId, history };
}

export async function POST(request: Request) {
  let body: AgentChatRequestBody;
  try {
    body = (await request.json()) as AgentChatRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        message: 'JSON の形式が正しくありません',
      } satisfies AgentChatErrorResponse,
      { status: 400 }
    );
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        message: 'message が空です',
      } satisfies AgentChatErrorResponse,
      { status: 400 }
    );
  }

  const notionToken =
    process.env.NOTION_API_TOKEN?.trim() || process.env.NOTION_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!notionToken || !openaiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing_config',
        message: 'NOTION_API_TOKEN（or KEY）と OPENAI_API_KEY をサーバー環境に設定してください。',
      } satisfies AgentChatErrorResponse,
      { status: 503 }
    );
  }

  const { sessionId, history } = getOrCreateSession(
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : undefined
  );

  try {
    const ctx = await fetchNotionContext();
    const contextText = notionContextToText(ctx);

    const reply = await generateReply({
      userMessage: message,
      notionContext: contextText,
      conversationHistory: history.slice(-20),
    });

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });

    return NextResponse.json({
      ok: true,
      reply,
      sessionId,
      source: 'notion-db-openai',
      fallbackUsed: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    console.error('[agent-chat]', e);

    return NextResponse.json(
      {
        ok: false,
        error: 'agent_failed',
        message: msg,
      } satisfies AgentChatErrorResponse,
      { status: 502 }
    );
  }
}
