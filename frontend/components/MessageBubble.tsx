'use client';

import React from 'react';

export interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  suggestions?: string[] | null;
  onSuggestionClick?: (text: string) => void;
  /** ボット側のみ。本文の上に表示 */
  imageUrl?: string | null;
}

export function MessageBubble({
  content,
  isUser,
  suggestions = [],
  onSuggestionClick,
  imageUrl,
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
        {!isUser && imageUrl ? (
          <div className="mb-3 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100/50">
            {/* External menu images can come from arbitrary Notion/backend URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="max-h-64 w-full object-contain"
              loading="lazy"
            />
          </div>
        ) : null}
        <div
          className={`break-words whitespace-pre-wrap text-sm leading-relaxed md:text-[15px] ${
            isUser ? 'text-white' : 'text-slate-700'
          }`}
          dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />') }}
        />

        {!isUser && safeSuggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {safeSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestionClick?.(s)}
                className="rounded-full border border-slate-300/70 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-cyan-500 hover:text-white hover:shadow"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500 to-blue-600 text-lg text-white shadow-lg">
          👤
        </div>
      )}
    </div>
  );
}
