'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { QuickReplyButtons } from './QuickReplyButtons';
import { createSession, sendChatMessage, type ChatResponse } from '../lib/api';
import {
  resolveCustomerMemoryIdentity,
  updateCustomerMemoryConsent,
} from '../lib/customerMemory';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  suggestions?: string[] | null;
  imageUrl?: string | null;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerConsentStatus, setCustomerConsentStatus] = useState<string>('unknown');
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
    resolveCustomerMemoryIdentity()
      .catch(() => null)
      .then((identity) => {
        const anonymousCustomerId = identity?.anonymous_customer_id ?? null;
        if (mounted) setCustomerId(anonymousCustomerId);
        if (mounted && identity?.consent_status) {
          setCustomerConsentStatus(identity.consent_status);
        }
        return createSession(anonymousCustomerId);
      })
      .then((data) => {
        if (mounted) {
          setSessionId(data.session_id);
          if (data.customer_id) setCustomerId(data.customer_id);
          setMessages([
            {
              id: 'welcome',
              content:
                'いらっしゃいませ！おおつきチャットボットでございます。\n伝統の味と心で、皆様のお越しをお待ちしております。\nメニューや店舗情報について、何でもお気軽にお聞かせください。',
              isUser: false,
              suggestions: [
                '日替わりランチ（月曜～金曜）',
                '寿司ランチ',
                'おすすめ定食',
                '海鮮定食',
                '定食屋メニュー',
                '逸品料理',
                '海鮮刺身',
                '今晩のおすすめ一品',
                '酒のつまみ',
                '焼き鳥',
                '静岡名物料理フェア',
              ],
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
        const res: ChatResponse = await sendChatMessage(text, sessionId, customerId);
        if (res.session_id) setSessionId(res.session_id);

        const botMsg: Message = {
          id: `bot-${Date.now()}`,
          content: res.message,
          isUser: false,
          suggestions: res.suggestions ?? res.options ?? null,
          imageUrl: res.image_url ?? null,
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
    [sessionId, customerId, loading]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend]
  );

  const handleCustomerMemoryConsent = useCallback(
    async (consentStatus: 'granted' | 'denied') => {
      if (!customerId) return;
      try {
        const result = await updateCustomerMemoryConsent(customerId, consentStatus);
        setCustomerConsentStatus(result.consent_status);
      } catch {
        setCustomerConsentStatus('unknown');
      }
    },
    [customerId]
  );

  if (initError) {
    const isDevelopment = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const backendUrl = isDevelopment ? 'http://localhost:8011' : 'バックエンドサーバー';
    
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <p className="mb-3 rounded-full border border-red-300 bg-red-500/10 px-4 py-1 text-sm text-red-200">
          接続エラー
        </p>
        <p className="mb-2 text-base font-medium text-white">{initError}</p>
        <p className="text-sm text-slate-300">
          {isDevelopment 
            ? `バックエンド（${backendUrl}）が起動しているか確認してください。`
            : 'バックエンドサーバーへの接続に失敗しました。しばらく待ってから再度お試しください。'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-950/20 to-slate-900/30">
      {customerId && customerConsentStatus === 'unknown' && (
        <div className="border-b border-white/15 bg-slate-950/45 px-4 py-3 text-sm text-white backdrop-blur-xl">
          <div className="mb-2 font-medium">以前の注文履歴を、今後のご案内に利用してもよいですか？</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleCustomerMemoryConsent('granted')}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
            >
              利用する
            </button>
            <button
              type="button"
              onClick={() => handleCustomerMemoryConsent('denied')}
              className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
            >
              利用しない
            </button>
          </div>
        </div>
      )}
      <div className="chat-scrollbar flex-1 overflow-y-auto px-2.5 pb-24 pt-2 md:px-6 md:pb-28 md:pt-5"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            content={m.content}
            isUser={m.isUser}
            suggestions={m.suggestions}
            onSuggestionClick={handleSuggestionClick}
            imageUrl={m.imageUrl}
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

      <div className="shrink-0 border-t border-white/15 bg-slate-950/35 px-1.5 pb-1 pt-0.5 backdrop-blur-xl md:px-3 md:pb-2 md:pt-1"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <QuickReplyButtons onSelect={handleSend} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}
