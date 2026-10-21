import { CreateOrgForm } from "./create-org-form";
import { acceptInvitationAction } from "./actions";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyOrganizations } from "@/modules/organizations/service";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">読み込み中…</p>}>
      <SelectOrganization searchParams={searchParams} />
    </Suspense>
  );
}

async function SelectOrganization({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const notice = (await searchParams).notice;
  const memberships = await listMyOrganizations(getDb(), user);
  const active = memberships.filter((item) => item.status === "active" && item.orgStatus === "active");
  const invited = memberships.filter((item) => item.status === "invited" && item.orgStatus === "active");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">企業を選択</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <LogoutButton />
      </div>
      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>所属企業</CardTitle>
          <CardDescription>入れるのは、有効な所属がある企業だけです。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {active.length === 0 ? <p className="text-sm text-muted-foreground">まだ所属がありません。</p> : null}
          {active.map((item) => (
            <Link key={item.organizationId} href={`/app/${item.slug}/dashboard`} className="underline">
              {item.name}（{item.role}）
            </Link>
          ))}
          {invited.map((item) => (
            <form key={item.organizationId} action={acceptInvitationAction.bind(null, item.organizationId, item.slug)}>
              <Button type="submit" variant="outline">
                {item.name} の招待を承諾
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>新しい企業</CardTitle>
          <CardDescription>作成した人がオーナーになります。</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </main>
  );
}
