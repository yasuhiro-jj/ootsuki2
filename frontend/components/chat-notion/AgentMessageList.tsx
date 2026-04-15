'use client';

import React, { useEffect, useRef } from 'react';

export type AgentBubble = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type Props = {
  messages: AgentBubble[];
  loading: boolean;
};

export function AgentMessageList({ messages, loading }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div
      className="chat-scrollbar agent-chat-scrollbar flex-1 overflow-y-auto px-2.5 pb-24 pt-2 md:px-6 md:pb-28 md:pt-5"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`mb-4 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {m.role === 'assistant' && (
            <div className="mr-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/60 bg-white/90 text-lg shadow-md">
              ✨
            </div>
          )}
          <div
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-md md:max-w-[78%] md:text-[15px] ${
              m.role === 'user'
                ? 'rounded-tr-md bg-gradient-to-br from-indigo-600 to-violet-700 text-white'
                : 'rounded-tl-md border border-slate-200/80 bg-white/95 text-slate-800'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
          </div>
        </div>
      ))}

      {loading && (
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/60 bg-white/90 text-lg shadow-md">
            ✨
          </div>
          <div className="rounded-2xl rounded-tl-md border border-slate-200/80 bg-white/95 px-4 py-3 shadow-md">
            <span className="inline-flex gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500 [animation-delay:240ms]" />
            </span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
