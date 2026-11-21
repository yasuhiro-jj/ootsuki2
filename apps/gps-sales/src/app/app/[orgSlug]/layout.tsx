import { OrgNav } from "@/components/app/org-nav";
import { loadOrgPage } from "@/lib/org-page";
import { Suspense } from "react";

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">読み込み中…</p>}>
      <OrgFrame params={params}>{children}</OrgFrame>
    </Suspense>
  );
}

async function OrgFrame({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { ctx } = await loadOrgPage(orgSlug);
  return (
    <div className="flex min-h-full flex-col">
      <OrgNav slug={ctx.organization.slug} name={ctx.organization.name} />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">{children}</div>
    </div>
  );
}
