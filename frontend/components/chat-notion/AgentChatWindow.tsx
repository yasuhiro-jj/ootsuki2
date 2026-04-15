'use client';

import React, { useCallback, useState } from 'react';
import { AgentInputBox } from './AgentInputBox';
import { AgentMessageList, type AgentBubble } from './AgentMessageList';
import type { AgentChatResponse } from '@/types/chat';

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `m-${Date.now()}-${idCounter}`;
}

export function AgentChatWindow() {
  const [messages, setMessages] = useState<AgentBubble[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'いらっしゃいませ！おおつきチャットボットです。\nNotionのメニュー・店舗データをもとにお答えします。\nお気軽にどうぞ。',
    },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setErrorBanner(null);
      setLoading(true);

      const userMsg: AgentBubble = {
        id: nextId(),
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch('/api/agent-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            ...(sessionId ? { sessionId } : {}),
          }),
        });

        const data = (await res.json()) as AgentChatResponse;

        if (!data.ok) {
          const msg =
            data.message ||
            (data.error === 'missing_config'
              ? 'Notion Agent の設定を確認してください。'
              : '応答を取得できませんでした。');
          setErrorBanner(msg);
          return;
        }

        setSessionId(data.sessionId);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: data.reply,
          },
        ]);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : '通信に失敗しました';
        setErrorBanner(msg);
      } finally {
        setLoading(false);
      }
    },
    [loading, sessionId]
  );

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-indigo-950/25 to-slate-900/35">
      {errorBanner && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-center text-xs text-amber-950 md:text-sm">
          {errorBanner}
        </div>
      )}
      <AgentMessageList messages={messages} loading={loading} />
      <AgentInputBox onSend={send} disabled={loading} />
    </div>
  );
}
