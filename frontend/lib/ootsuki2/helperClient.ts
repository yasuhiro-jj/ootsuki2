/**
 * ootsuki2 補助 API（将来の fallback / RAG 等）
 * Phase 1 では未使用。Route Handler から差し替え可能な形で export のみ。
 */

export type HelperChatParams = {
  message: string;
  sessionId?: string;
};

export type HelperChatResult = {
  message: string;
  session_id: string;
};

/**
 * 補助レイヤーへ問い合わせ（環境変数が揃っている場合のみ）
 */
export async function callOotsuki2Helper(
  _params: HelperChatParams
): Promise<HelperChatResult | null> {
  const base = process.env.OOTSUKI2_API_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    return null;
  }

  // Phase 2: FastAPI の既存 /chat 等に合わせて実装する
  // const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // if (process.env.OOTSUKI2_API_KEY) {
  //   headers['Authorization'] = `Bearer ${process.env.OOTSUKI2_API_KEY}`;
  // }
  // const res = await fetch(`${base}/chat`, { method: 'POST', headers, body: JSON.stringify(...) });
  // ...

  return null;
}
