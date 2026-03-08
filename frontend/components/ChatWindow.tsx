'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { QuickReplyButtons } from './QuickReplyButtons';
import { createSession, sendChatMessage, type ChatResponse } from '../lib/api';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  suggestions?: string[] | null;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    let mounted = true;
    createSession()
      .then((data) => {
        if (mounted) {
          setSessionId(data.session_id);
          setMessages([
            {
              id: 'welcome',
              content:
                'いらっしゃいませ！おおつきチャットボットでございます。\n伝統の味と心で、皆様のお越しをお待ちしております。\nメニューや店舗情報について、何でもお気軽にお聞かせください。',
              isUser: false,
            },
          ]);
        }
      })
      .catch((err) => {
        if (mounted) setInitError(err.message || 'セッションの初期化に失敗しました');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        content: text,
        isUser: true,
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res: ChatResponse = await sendChatMessage(text, sessionId);
        if (res.session_id) setSessionId(res.session_id);

        const botMsg: Message = {
          id: `bot-${Date.now()}`,
          content: res.message,
          isUser: false,
          suggestions: res.suggestions ?? res.options ?? null,
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : '申し訳ございません。エラーが発生しました。';
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, content: `エラー: ${errMsg}`, isUser: false },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, loading]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend]
  );

  if (initError) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <p className="mb-3 rounded-full border border-red-300 bg-red-500/10 px-4 py-1 text-sm text-red-200">
          接続エラー
        </p>
        <p className="mb-2 text-base font-medium text-white">{initError}</p>
        <p className="text-sm text-slate-300">
          バックエンド（http://localhost:8000）が起動しているか確認してください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-950/20 to-slate-900/30">
      <div className="chat-scrollbar flex-1 overflow-y-auto px-2.5 pb-1.5 pt-2 md:px-6 md:pb-3 md:pt-5">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            content={m.content}
            isUser={m.isUser}
            suggestions={m.suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
        ))}

        {loading && (
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-lg shadow-lg backdrop-blur">
              🍱
            </div>
            <div className="rounded-2xl rounded-tl-md border border-white/20 bg-white/75 px-4 py-3 shadow-lg backdrop-blur">
              <span className="inline-flex gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500 [animation-delay:120ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500 [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/15 bg-slate-950/35 px-1.5 pb-1 pt-0.5 backdrop-blur-xl md:px-3 md:pb-2 md:pt-1">
        <QuickReplyButtons onSelect={handleSend} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}
