'use client';

import React from 'react';

const QUICK_REPLIES = [
  '営業時間を教えて',
  'テイクアウトできますか？',
  '宴会の予約について',
  '人気メニューは？',
];

export interface QuickReplyButtonsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function QuickReplyButtons({ onSelect, disabled = false }: QuickReplyButtonsProps) {
  return (
    <div className="chat-scrollbar flex gap-1.5 overflow-x-auto px-1.5 py-1 md:flex-wrap md:gap-2 md:px-2 md:py-2 md:overflow-visible">
      {QUICK_REPLIES.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          disabled={disabled}
          className={`whitespace-nowrap rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
            disabled
              ? 'cursor-not-allowed bg-white/5 text-slate-400'
              : 'bg-white/10 text-slate-100 hover:-translate-y-0.5 hover:bg-white/20'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
