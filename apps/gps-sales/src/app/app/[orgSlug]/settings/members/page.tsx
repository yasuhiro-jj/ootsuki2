import { inviteMemberAction, removeMemberAction, updateMemberAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { loadOrgPage } from "@/lib/org-page";
import { listOrganizationMembers } from "@/modules/organizations/service";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgSlug } = await params;
  const loaded = await loadOrgPage(orgSlug);
  const error = (await searchParams).error;
  const { members } = await listOrganizationMembers(
    loaded.db,
    loaded.user,
    loaded.ctx.organization.id,
  );
  const slug = loaded.ctx.organization.slug;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">メンバー</h1>
        <p className="text-sm text-muted-foreground">
          招待と権限変更はオーナーと管理者だけです。メール送信はまだ行いません。相手がアカウントを持っている必要があります。
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form action={inviteMemberAction.bind(null, slug)} className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-4">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="invite-email">メールアドレス</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">権限</Label>
          <select id="invite-role" name="role" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" defaultValue="staff">
            {ROLES.map((role) => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit">招待</Button>
        </div>
      </form>
      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{member.name}</p>
              <p className="truncate text-sm text-muted-foreground">{member.email}</p>
            </div>
            <Badge variant="outline">{member.status}</Badge>
            <form action={updateMemberAction.bind(null, slug, member.userId)} className="flex flex-wrap items-center gap-2">
              <select name="role" defaultValue={member.role} aria-label={`${member.name}の権限`} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                {ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
              {member.status === "invited" ? (
                <Badge>招待中</Badge>
              ) : (
                <select name="status" defaultValue={member.status} aria-label={`${member.name}の状態`} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                  <option value="active">有効</option>
                  <option value="disabled">停止</option>
                </select>
              )}
              <Button type="submit" variant="outline">更新</Button>
            </form>
            <form action={removeMemberAction.bind(null, slug, member.userId)}>
              <Button type="submit" variant="destructive">削除</Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
