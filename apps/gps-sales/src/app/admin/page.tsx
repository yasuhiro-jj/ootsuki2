import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>運営管理</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          運営画面は Phase 2 です。一般の企業ユーザー向け画面からは分離し、この段階では企業データを読みません。
        </CardContent>
      </Card>
    </main>
  );
}
