import { withDeps } from "@/lib/live-deps";
import {
  deleteCustomerHttp,
  getCustomerHttp,
  updateCustomerHttp,
} from "@/modules/customers/http";

type Context = { params: Promise<{ orgId: string; customerId: string }> };

export async function GET(_request: Request, context: Context) {
  const { orgId, customerId } = await context.params;
  return withDeps((deps) => getCustomerHttp(orgId, customerId, deps));
}

export async function PATCH(request: Request, context: Context) {
  const { orgId, customerId } = await context.params;
  return withDeps((deps) => updateCustomerHttp(request, orgId, customerId, deps));
}

export async function DELETE(_request: Request, context: Context) {
  const { orgId, customerId } = await context.params;
  return withDeps((deps) => deleteCustomerHttp(orgId, customerId, deps));
}
