import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentLoginPrincipal } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const principal = await getCurrentLoginPrincipal();
  if (principal) {
    redirect("/dashboard");
  }

  const nextValue = typeof searchParams?.next === "string" ? searchParams.next : "/dashboard";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#f5f5f4_45%,_#e7e5e4_100%)] px-4 py-16 text-stone-900">
      <div className="mx-auto max-w-md rounded-[32px] border border-stone-900/10 bg-white/90 p-8 shadow-[0_30px_80px_rgba(28,25,23,0.16)]">
        <p className="text-xs uppercase tracking-[0.35em] text-orange-700">AI Maneger</p>
        <h1 className="mt-4 text-3xl font-bold">ログイン</h1>
        <p className="mt-3 text-sm leading-7 text-stone-600">
          個別ユーザー認証でログインしてください。認証後に tenant membership に基づいて画面と API のアクセスを制御します。
        </p>
        <div className="mt-8">
          <LoginForm nextPath={nextValue} />
        </div>
      </div>
    </main>
  );
}

