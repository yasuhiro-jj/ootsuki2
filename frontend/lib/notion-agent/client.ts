/**
 * Notion Custom Agent 呼び出し（公式 Agents API 準拠の fetch 実装）
 * @see https://github.com/makenotion/notion-agents-sdk-js
 */

const DEFAULT_BASE = 'https://api.notion.com';
const DEFAULT_VERSION = '2026-03-11';

type ChatInvocationResponse = {
  object: 'chat.invocation';
  agent_id: string;
  thread_id: string;
  status: 'pending';
};

type ThreadListResponse = {
  object: 'list';
  type: 'thread';
  results: Array<{
    object: 'thread';
    id: string;
    status: 'pending' | 'completed' | 'failed';
    error?: string;
  }>;
  has_more: boolean;
  next_cursor: string | null;
};

type ThreadMessageListResponse = {
  object: 'list';
  type: 'thread_message';
  results: Array<{
    object: 'thread_message';
    id: string;
    role: 'user' | 'agent';
    content: string;
    created_time: string;
  }>;
  has_more: boolean;
  next_cursor: string | null;
};

export class NotionAgentClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'NotionAgentClientError';
  }
}

export function getConfig() {
  // Python 側の .env は NOTION_API_KEY のことが多いので両方受け付ける
  const token =
    process.env.NOTION_API_TOKEN?.trim() ||
    process.env.NOTION_API_KEY?.trim();
  const agentId = process.env.NOTION_AGENT_ID?.trim();
  const baseUrl = (process.env.NOTION_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const notionVersion = process.env.NOTION_API_VERSION || DEFAULT_VERSION;
  return { token, agentId, baseUrl, notionVersion };
}

export function isNotionAgentConfigured(): boolean {
  const { token, agentId } = getConfig();
  return Boolean(token && agentId);
}

/**
 * トークンが Notion の通常 API で通るか（GET /v1/users/me）。
 * 401 のときはトークン値・再発行・コピーミスを疑う。
 */
export async function verifyNotionIntegrationToken(): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  const cfg = getConfig();
  if (!cfg.token) {
    return { ok: false, status: 0, message: 'NOTION_API_TOKEN / NOTION_API_KEY が未設定です' };
  }

  const res = await fetch(`${cfg.baseUrl}/v1/users/me`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Notion-Version': cfg.notionVersion,
    },
  });

  if (res.ok) {
    return { ok: true, status: res.status };
  }

  const text = await res.text();
  let message = text;
  try {
    const j = JSON.parse(text) as { message?: string };
    message = j.message ?? text;
  } catch {
    /* raw */
  }
  return { ok: false, status: res.status, message };
}

async function notionJson<T>(
  path: string,
  options: {
    method: 'GET' | 'POST';
    body?: unknown;
    query?: Record<string, string | undefined>;
  },
  cfg: ReturnType<typeof getConfig>
): Promise<T> {
  const url = new URL(`${cfg.baseUrl}/v1/${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Notion-Version': cfg.notionVersion,
      'Content-Type': 'application/json',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: string }).message)
        : `HTTP ${res.status}`;
    throw new NotionAgentClientError(msg, res.status, data);
  }

  return data as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollThread(
  agentId: string,
  threadId: string,
  cfg: ReturnType<typeof getConfig>,
  maxAttempts = 60
): Promise<ThreadListResponse['results'][0]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const exp = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      const jitter = Math.random() * 500;
      await sleep(exp + jitter);
    }

    const list = await notionJson<ThreadListResponse>(
      `agents/${agentId}/threads`,
      { method: 'GET', query: { id: threadId } },
      cfg
    );

    const thread =
      list.results.find((t) => t.id === threadId) ?? list.results[0];
    if (!thread) {
      await sleep(1000);
      continue;
    }

    if (thread.status === 'completed' || thread.status === 'failed') {
      return thread;
    }
  }

  throw new NotionAgentClientError('スレッドの完了待ちがタイムアウトしました');
}

function pickLastAgentContent(messages: ThreadMessageListResponse['results']): string {
  const agents = messages.filter((m) => m.role === 'agent');
  const last = agents[agents.length - 1];
  return last?.content?.trim() ?? '';
}

/**
 * メッセージを送信し、完了後にエージェントの最終返答テキストを返す。
 * @param threadId 継続時は Notion の thread_id（クライアントの sessionId と同一）
 */
export async function sendNotionAgentMessage(params: {
  message: string;
  threadId?: string;
}): Promise<{ reply: string; threadId: string }> {
  const cfg = getConfig();
  if (!cfg.token || !cfg.agentId) {
    throw new NotionAgentClientError('NOTION_API_TOKEN / NOTION_AGENT_ID が未設定です');
  }

  const body: Record<string, string> = { message: params.message };
  if (params.threadId) {
    body.thread_id = params.threadId;
  }

  const inv = await notionJson<ChatInvocationResponse>(
    `agents/${cfg.agentId}/chat`,
    { method: 'POST', body },
    cfg
  );

  const threadId = inv.thread_id;
  const thread = await pollThread(cfg.agentId, threadId, cfg);

  if (thread.status === 'failed') {
    throw new NotionAgentClientError(thread.error || 'エージェントの処理に失敗しました');
  }

  const msgList = await notionJson<ThreadMessageListResponse>(
    `threads/${threadId}/messages`,
    {
      method: 'GET',
      query: { page_size: '50', verbose: 'false' },
    },
    cfg
  );

  const reply = pickLastAgentContent(msgList.results);
  if (!reply) {
    throw new NotionAgentClientError('エージェントからの返答を取得できませんでした');
  }

  return { reply, threadId };
}
