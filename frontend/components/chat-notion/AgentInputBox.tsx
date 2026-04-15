'use client';

import React, { useCallback, useState } from 'react';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function AgentInputBox({
  onSend,
  disabled = false,
  placeholder = 'メッセージを入力...',
}: Props) {
  const [value, setValue] = useState('');

  const submit = useCallback(() => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  }, [value, disabled, onSend]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-center gap-1.5 border-t border-indigo-900/10 bg-slate-950/20 px-1.5 py-1.5 backdrop-blur-xl md:gap-3 md:px-3 md:py-2"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          maxLength={2000}
          disabled={disabled}
          className="w-full rounded-2xl border border-white/25 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-500 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 md:px-4 md:py-3 md:text-[15px]"
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-indigo-900/30 disabled:cursor-not-allowed disabled:opacity-50 md:px-5 md:py-3"
      >
        送信
      </button>
    </div>
  );
}
