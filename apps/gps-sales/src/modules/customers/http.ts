import { handle, requireActor, type HttpDeps } from "@/lib/http";
import { parseInput, readJson } from "@/lib/validation";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./schemas";
import {
  createOrgCustomer,
  deleteOrgCustomer,
  getOrgCustomer,
  listOrgCustomers,
  updateOrgCustomer,
} from "./service";

export function listCustomersHttp(request: Request, organizationId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const url = new URL(request.url);
    const query = parseInput(listCustomersQuerySchema, {
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const result = await listOrgCustomers(deps.db, actor, organizationId, query);
    return Response.json(result);
  });
}

export function getCustomerHttp(organizationId: string, customerId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const customer = await getOrgCustomer(deps.db, actor, organizationId, customerId);
    return Response.json({ customer });
  });
}

export function createCustomerHttp(request: Request, organizationId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const input = parseInput(createCustomerSchema, await readJson(request));
    const result = await createOrgCustomer(deps.db, actor, organizationId, input);
    return Response.json(result, { status: result.created ? 201 : 200 });
  });
}

export function updateCustomerHttp(
  request: Request,
  organizationId: string,
  customerId: string,
  deps: HttpDeps,
) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const input = parseInput(updateCustomerSchema, await readJson(request));
    const customer = await updateOrgCustomer(deps.db, actor, organizationId, customerId, input);
    return Response.json({ customer });
  });
}

export function deleteCustomerHttp(organizationId: string, customerId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    await deleteOrgCustomer(deps.db, actor, organizationId, customerId);
    return new Response(null, { status: 204 });
  });
}
