import Link from 'next/link';
import { AgentChatWindow } from '@/components/chat-notion/AgentChatWindow';

export default function AgentPage() {
  return (
    <main className="relative min-h-screen bg-[#eef2ff] text-slate-900">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-indigo-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-violet-200/30 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-[390px] md:min-h-screen md:max-w-xl md:items-end md:px-8 md:pb-6 md:pt-10">
        <section
          className="flex h-[100dvh] w-full flex-col md:h-[85vh] md:min-h-[560px] md:max-h-[820px] md:rounded-3xl md:border md:border-indigo-900/10 md:bg-white/80 md:shadow-[0_20px_80px_rgba(30,27,75,0.15)] md:backdrop-blur-2xl"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <header className="shrink-0 overflow-hidden border-b border-indigo-900/10 bg-gradient-to-r from-indigo-800/95 via-violet-800/95 to-indigo-900/95 px-4 py-3 text-white md:px-8 md:py-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
            <div className="relative">
              <p className="mb-1 text-center">
                <Link
                  href="/"
                  className="text-[11px] text-white/85 underline-offset-2 hover:text-white hover:underline md:text-sm"
                >
                  ← 通常版チャットへ
                </Link>
              </p>
              <h1 className="text-center text-lg font-bold tracking-wide md:text-2xl">
                Notion Agent チャット
              </h1>
              <p className="mt-0.5 text-center text-[11px] text-white/90 md:mt-1.5 md:text-sm">
                ナレッジは Notion を参照してお答えします
              </p>
            </div>
          </header>

          <div className="min-h-0 flex-1 bg-white/80">
            <AgentChatWindow />
          </div>
        </section>
      </div>
    </main>
  );
}
