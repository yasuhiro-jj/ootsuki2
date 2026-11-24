import { withDeps } from "@/lib/live-deps";
import { inviteMemberHttp, listMembersHttp } from "@/modules/organizations/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;
  return withDeps((deps) => listMembersHttp(orgId, deps));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;
  return withDeps((deps) => inviteMemberHttp(request, orgId, deps));
}
