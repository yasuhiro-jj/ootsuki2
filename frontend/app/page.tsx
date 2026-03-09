import { ChatWindow } from '@/components/ChatWindow';

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5efe6] text-slate-900">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-orange-200/25 blur-3xl" />

      {/* スマホ: 画面全体 / PC: 中央に広めのカード */}
      <div className="relative mx-auto flex w-full max-w-[390px] md:min-h-screen md:max-w-xl md:items-end md:px-8 md:pb-6 md:pt-10">
        <section className="flex h-[100svh] w-full flex-col overflow-hidden md:h-[85vh] md:min-h-[560px] md:max-h-[820px] md:rounded-3xl md:border md:border-amber-900/10 md:bg-white/75 md:shadow-[0_20px_80px_rgba(71,45,24,0.18)] md:backdrop-blur-2xl">
          <header className="shrink-0 overflow-hidden border-b border-amber-900/10 bg-gradient-to-r from-[#a85632]/95 via-[#8f4d2d]/95 to-[#6f3c26]/95 px-4 py-3 text-white md:px-8 md:py-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.18),transparent_50%)]" />
            <div className="relative">
              <h1 className="text-center text-lg font-bold tracking-wide md:text-3xl">
                おおつきチャットボット
              </h1>
              <p className="mt-0.5 text-center text-[11px] text-white/90 md:mt-2 md:text-base">
                伝統の味と心でおもてなし。何でもお気軽にお聞きください
              </p>
            </div>
          </header>

          <div className="min-h-0 flex-1 bg-white/75">
            <ChatWindow />
          </div>
        </section>
      </div>
    </main>
  );
}
