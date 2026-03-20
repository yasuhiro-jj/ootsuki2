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
  /** 検証済みの直接画像URL（先頭メニュー1件のみ） */
  image_url?: string | null;
  /** LINE Messaging API 用 messages 配列（任意） */
  line_reply_messages?: Record<string, unknown>[] | null;
}

export interface SessionResponse {
  session_id: string;
}

export async function createSession(): Promise<SessionResponse> {
  try {
    const response = await fetch(`${API_BASE}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMessage = error.detail || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[API] セッション作成エラー:', errorMessage);
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error: any) {
    if (error instanceof Error) {
      throw error;
    }
    console.error('[API] セッション作成エラー:', error);
    throw new Error('セッション作成に失敗しました: ' + String(error));
  }
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null
): Promise<ChatResponse> {
  try {
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
      const errorMessage = error.detail || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[API] チャット送信エラー:', errorMessage, {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error: any) {
    if (error instanceof Error) {
      throw error;
    }
    console.error('[API] チャット送信エラー:', error);
    throw new Error('チャット送信に失敗しました: ' + String(error));
  }
}
