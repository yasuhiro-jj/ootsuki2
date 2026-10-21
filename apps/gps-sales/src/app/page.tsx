import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm text-muted-foreground">複数企業向け</p>
      <h1 className="text-3xl font-semibold tracking-tight">GPS営業訪問管理</h1>
      <p className="text-muted-foreground">
        企業ごとに顧客と所属を分けて管理します。訪問の位置・写真・地図・報告書は次の段階です。位置情報の常時追跡は行いません。
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/login" />}>ログイン</Button>
        <Button variant="outline" render={<Link href="/signup" />}>
          企業アカウントを作成
        </Button>
      </div>
    </main>
  );
}
