import { withDeps } from "@/lib/live-deps";
import { acceptInvitationHttp } from "@/modules/organizations/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;
  return withDeps((deps) => acceptInvitationHttp(orgId, deps));
}
