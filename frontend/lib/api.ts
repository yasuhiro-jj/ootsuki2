/**
 * フロントエンド用のAPIクライアント
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/proxy';

export interface ChatResponse {
  message: string;
  session_id: string;
  timestamp?: string;
  suggestions?: string[];
  options?: string[];
}

export interface SessionResponse {
  session_id: string;
}

export async function createSession(): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'セッション作成に失敗しました');
  }

  return response.json();
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'チャット送信に失敗しました');
  }

  return response.json();
}
