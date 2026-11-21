import { customers, memberships, visits } from "@/db/schema";
import { loadOrgPage } from "@/lib/org-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eq, sql } from "drizzle-orm";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { ctx, db } = await loadOrgPage(orgSlug);
  const organizationId = ctx.organization.id;
  const [customerCount, memberCount, visitCount] = await Promise.all([
    countRows(db, customers, organizationId),
    countRows(db, memberships, organizationId),
    countRows(db, visits, organizationId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">ダッシュボード</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="顧客" value={customerCount} />
        <Stat label="所属" value={memberCount} />
        <Stat label="訪問" value={visitCount} />
      </div>
      <p className="text-sm text-muted-foreground">
        件数はこの企業だけを数えています。訪問の記録画面は Phase 2 です。
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

async function countRows(
  db: Awaited<ReturnType<typeof loadOrgPage>>["db"],
  table: typeof customers | typeof memberships | typeof visits,
  organizationId: string,
) {
  const organizationColumn = table.organizationId;
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(organizationColumn, organizationId));
  return rows[0]?.total ?? 0;
}
