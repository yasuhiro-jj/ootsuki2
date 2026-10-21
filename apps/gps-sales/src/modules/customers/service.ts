import type { Db } from "@/db/client";
import type { CurrentUser } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/postgres";
import { assertUuid } from "@/lib/validation";
import { requireActiveOrg } from "@/modules/access/context";
import { writeAudit } from "@/modules/audit/repository";
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from "./schemas";
import {
  customerHasVisits,
  deleteCustomer,
  findCustomer,
  insertCustomer,
  listCustomers,
  updateCustomer,
} from "./repository";

export async function listOrgCustomers(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  query: ListCustomersQuery,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  const page = await listCustomers(db, ctx.organization.id, query);
  return {
    customers: page.customers,
    page: { limit: query.limit, offset: query.offset, total: page.total },
  };
}

export async function getOrgCustomer(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  customerId: string,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  assertUuid(customerId);
  const customer = await findCustomer(db, ctx.organization.id, customerId);
  if (!customer) throw new AppError(404, "not_found", "顧客が見つかりません");
  return customer;
}

export async function createOrgCustomer(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  input: CreateCustomerInput,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  if (input.id) {
    const existing = await findCustomer(db, ctx.organization.id, input.id);
    if (existing) return { customer: existing, created: false as const };
  }
  try {
    return await db.transaction(async (tx) => {
      const customer = await insertCustomer(tx, ctx.organization.id, input);
      await writeAudit(tx, {
        organizationId: ctx.organization.id,
        actorUserId: actor.id,
        action: "customer.create",
        entityType: "customer",
        entityId: customer.id,
        details: { fields: ["name"] },
      });
      return { customer, created: true as const };
    });
  } catch (error) {
    if (input.id && isUniqueViolation(error)) {
      const existing = await findCustomer(db, ctx.organization.id, input.id);
      if (existing) return { customer: existing, created: false as const };
      throw new AppError(409, "conflict", "顧客を作成できません");
    }
    throw error;
  }
}

export async function updateOrgCustomer(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  assertUuid(customerId);
  return db.transaction(async (tx) => {
    const customer = await updateCustomer(tx, ctx.organization.id, customerId, input);
    if (!customer) throw new AppError(404, "not_found", "顧客が見つかりません");
    await writeAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: actor.id,
      action: "customer.update",
      entityType: "customer",
      entityId: customer.id,
      details: { fields: Object.keys(input) },
    });
    return customer;
  });
}

export async function deleteOrgCustomer(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  customerId: string,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  assertUuid(customerId);
  return db.transaction(async (tx) => {
    if (await customerHasVisits(tx, ctx.organization.id, customerId)) {
      throw new AppError(409, "customer_has_visits", "訪問がある顧客は削除できません");
    }
    const removed = await deleteCustomer(tx, ctx.organization.id, customerId);
    if (!removed) throw new AppError(404, "not_found", "顧客が見つかりません");
    await writeAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: actor.id,
      action: "customer.delete",
      entityType: "customer",
      entityId: customerId,
      details: {},
    });
    return removed;
  });
}
