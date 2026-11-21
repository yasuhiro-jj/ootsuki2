import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Phase2Stub({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        この画面は Phase 2 で実装します。チェックイン時の位置記録、写真、地図、報告書はまだ動作しません。常時の位置追跡は対象外です。
      </CardContent>
    </Card>
  );
}
