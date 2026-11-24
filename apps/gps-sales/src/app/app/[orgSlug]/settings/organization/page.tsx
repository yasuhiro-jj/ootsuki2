import { updateOrganizationAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadOrgPage } from "@/lib/org-page";

export default async function OrganizationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgSlug } = await params;
  const loaded = await loadOrgPage(orgSlug);
  const error = (await searchParams).error;
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">組織設定</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form action={updateOrganizationAction.bind(null, loaded.ctx.organization.slug)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="org-name">企業名</Label>
          <Input id="org-name" name="name" defaultValue={loaded.ctx.organization.name} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="org-slug">スラッグ</Label>
          <Input id="org-slug" defaultValue={loaded.ctx.organization.slug} readOnly />
        </div>
        <Button type="submit" className="w-fit">名前を保存</Button>
      </form>
      <p className="text-sm text-muted-foreground">スラッグは URL に使うため、この段階では変更できません。</p>
    </div>
  );
}
