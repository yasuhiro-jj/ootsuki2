'use client';

import React from 'react';

const QUICK_REPLIES = [
  'ランチメニューを見せて',
  'おすすめの料理は？',
  '営業時間を教えて',
  'テイクアウトできますか？',
  '宴会の予約について',
  '人気メニューは？',
];

export interface QuickReplyButtonsProps {
  onSelect: (text: string) => void;
}

export function QuickReplyButtons({ onSelect }: QuickReplyButtonsProps) {
  return (
    <div className="chat-scrollbar flex gap-1.5 overflow-x-auto px-1.5 py-1 md:flex-wrap md:gap-2 md:px-2 md:py-2 md:overflow-visible">
      {QUICK_REPLIES.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          className="whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/70 hover:bg-cyan-400/25 hover:text-white md:px-3 md:py-1.5 md:text-xs"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
