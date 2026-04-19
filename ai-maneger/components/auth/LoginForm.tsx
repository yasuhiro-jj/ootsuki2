"use client";

import { useFormState } from "react-dom";
import { loginAction, type LoginState } from "@/app/login/actions";
import { SubmitButton } from "@/components/common/submit-button";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="next" value={nextPath} />
      <label className="grid gap-2 text-sm font-medium text-stone-700">
        ユーザーID
        <input
          name="userId"
          type="text"
          autoComplete="username"
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        パスワード
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      {state.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {state.error}
        </div>
      ) : null}

      <SubmitButton idleLabel="ログイン" pendingLabel="認証中..." />
    </form>
  );
}

