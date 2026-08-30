'use client';

import React, { useState } from 'react';

interface CustomerLoginBannerProps {
  onLogin: (phone: string, name: string) => Promise<void>;
  onSkip: () => void;
  loading: boolean;
  error: string | null;
}

export function CustomerLoginBanner({ onLogin, onSkip, loading, error }: CustomerLoginBannerProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  const canSubmit = phone.trim().length >= 10 && name.trim().length > 0 && !loading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onLogin(phone.trim(), name.trim());
  };

  return (
    <div className="border-b border-white/15 bg-slate-950/45 px-4 py-3 text-sm text-white backdrop-blur-xl">
      <div className="mb-2 font-medium">
        お電話番号とお名前をご登録いただくと、次回ご来店時に好みに合わせたご提案ができます
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="tel"
          inputMode="numeric"
          placeholder="お電話番号（例: 09012345678）"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
          className="min-w-0 flex-1 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-white/50 outline-none focus:border-white/60"
        />
        <input
          type="text"
          placeholder="お名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          className="min-w-0 flex-1 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-white/50 outline-none focus:border-white/60"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
          >
            登録してはじめる
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={loading}
            className="whitespace-nowrap rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
          >
            今回は利用しない
          </button>
        </div>
      </form>
      {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
    </div>
  );
}
