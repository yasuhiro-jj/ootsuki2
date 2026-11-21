import { withDeps } from "@/lib/live-deps";
import { removeMemberHttp, updateMemberHttp } from "@/modules/organizations/http";

type Context = { params: Promise<{ orgId: string; userId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { orgId, userId } = await context.params;
  return withDeps((deps) => updateMemberHttp(request, orgId, userId, deps));
}

export async function DELETE(_request: Request, context: Context) {
  const { orgId, userId } = await context.params;
  return withDeps((deps) => removeMemberHttp(orgId, userId, deps));
}
