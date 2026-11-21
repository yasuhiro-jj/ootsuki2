import { withDeps } from "@/lib/live-deps";
import { updateOrganizationHttp } from "@/modules/organizations/http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;
  return withDeps((deps) => updateOrganizationHttp(request, orgId, deps));
}
