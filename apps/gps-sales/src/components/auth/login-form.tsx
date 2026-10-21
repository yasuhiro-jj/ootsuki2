"use client";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<FormValues>({ defaultValues: { email: "", password: "" } });

  async function onSubmit(values: FormValues) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setMessage("入力内容を確認してください");
      return;
    }
    setMessage(null);
    const result = await authClient.signIn.email(parsed.data);
    if (result.error) {
      setMessage("メールアドレスまたはパスワードが違います");
      return;
    }
    router.push("/select-organization");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">パスワード</Label>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
      </div>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        ログイン
      </Button>
    </form>
  );
}
