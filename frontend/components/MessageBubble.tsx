'use client';

import React from 'react';

export interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  suggestions?: string[] | null;
  onSuggestionClick?: (text: string) => void;
}

export function MessageBubble({
  content,
  isUser,
  suggestions = [],
  onSuggestionClick,
}: MessageBubbleProps) {
  const safeSuggestions = suggestions ?? [];

  return (
    <div
      className={`mb-5 flex items-end gap-3 animate-[messageSlide_0.45s_ease-out] ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isUser && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-lg shadow-lg backdrop-blur">
          🍱
        </div>
      )}

      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-xl md:max-w-[75%] ${
          isUser
            ? 'rounded-br-md border border-cyan-400/40 bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
            : 'rounded-bl-md border border-white/25 bg-white/85 text-slate-800 backdrop-blur'
        }`}
      >
        <div
          className={`break-words whitespace-pre-wrap text-sm leading-relaxed md:text-[15px] ${
            isUser ? 'text-white' : 'text-slate-700'
          }`}
          dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />') }}
        />
      </div>

      {isUser && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500 to-blue-600 text-lg text-white shadow-lg">
          👤
        </div>
      )}
    </div>
  );
}
