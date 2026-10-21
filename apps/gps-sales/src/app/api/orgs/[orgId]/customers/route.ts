import { withDeps } from "@/lib/live-deps";
import { createCustomerHttp, listCustomersHttp } from "@/modules/customers/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;
  return withDeps((deps) => listCustomersHttp(request, orgId, deps));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;
  return withDeps((deps) => createCustomerHttp(request, orgId, deps));
}
