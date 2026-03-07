import { ChatWindow } from '@/components/ChatWindow';

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5efe6] text-slate-900">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-orange-200/25 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-4 md:p-8">
        <section className="w-full overflow-hidden rounded-3xl border border-amber-900/10 bg-white/75 shadow-[0_20px_80px_rgba(71,45,24,0.18)] backdrop-blur-2xl">
          <header className="relative overflow-hidden border-b border-amber-900/10 bg-gradient-to-r from-[#a85632]/95 via-[#8f4d2d]/95 to-[#6f3c26]/95 px-6 py-6 text-white md:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.18),transparent_50%)]" />
            <div className="relative">
              <h1 className="text-center text-2xl font-bold tracking-wide md:text-3xl">
                おおつきチャットボット
              </h1>
              <p className="mt-2 text-center text-sm text-white/90 md:text-base">
                伝統の味と心でおもてなし。何でもお気軽にお聞きください
              </p>
            </div>
          </header>

          <div className="h-[76vh] min-h-[520px] max-h-[820px]">
            <ChatWindow />
          </div>
        </section>
      </div>
    </main>
  );
}
