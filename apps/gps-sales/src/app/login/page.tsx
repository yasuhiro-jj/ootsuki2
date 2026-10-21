import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            アカウントがない場合は <Link className="underline" href="/signup">新規登録</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
