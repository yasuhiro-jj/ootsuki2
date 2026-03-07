import { ChatWindow } from '@/components/ChatWindow';

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b18] text-slate-100">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-cyan-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-blue-600/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-4 md:p-8">
        <section className="w-full overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <header className="relative overflow-hidden border-b border-white/15 bg-gradient-to-r from-cyan-500/90 via-sky-500/90 to-blue-600/90 px-6 py-6 text-white md:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
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
