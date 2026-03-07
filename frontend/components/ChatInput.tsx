'use client';

import React, { useState, useCallback } from 'react';

export interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'メッセージを入力してください...',
}: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center gap-3 p-3">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={500}
          disabled={disabled}
          className="w-full rounded-2xl border border-white/20 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/20 md:text-[15px]"
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        送信
      </button>
    </div>
  );
}
