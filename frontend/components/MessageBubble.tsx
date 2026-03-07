'use client';

import React from 'react';

export interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
}

export function MessageBubble({
  content,
  isUser,
  suggestions = [],
  onSuggestionClick,
}: MessageBubbleProps) {
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

        {!isUser && suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
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
