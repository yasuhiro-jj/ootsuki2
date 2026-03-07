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
    <div className="chat-scrollbar flex gap-2 overflow-x-auto px-2 py-2 md:flex-wrap md:overflow-visible">
      {QUICK_REPLIES.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          className="whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/70 hover:bg-cyan-400/25 hover:text-white"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
