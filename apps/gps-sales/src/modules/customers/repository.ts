import type { Db } from "@/db/client";
import { customers, visits } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from "./schemas";

function likePattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

export async function listCustomers(
  db: Db,
  organizationId: string,
  query: ListCustomersQuery,
) {
  const filters = [eq(customers.organizationId, organizationId)];
  if (query.q) {
    filters.push(sql`${customers.name} ILIKE ${likePattern(query.q)} ESCAPE '\\'`);
  }
  const where = and(...filters);
  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(asc(customers.name))
    .limit(query.limit)
    .offset(query.offset);
  const totalRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);
  return { customers: rows, total: totalRows[0]?.total ?? 0 };
}

export async function findCustomer(db: Db, organizationId: string, customerId: string) {
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertCustomer(
  db: Db,
  organizationId: string,
  input: CreateCustomerInput,
) {
  const rows = await db
    .insert(customers)
    .values({
      id: input.id,
      organizationId,
      name: input.name,
      address: input.address ?? null,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("customer insert returned no row");
  return row;
}

export async function updateCustomer(
  db: Db,
  organizationId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const rows = await db
    .update(customers)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
    .returning();
  return rows[0] ?? null;
}

export async function customerHasVisits(
  db: Db,
  organizationId: string,
  customerId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: visits.id })
    .from(visits)
    .where(and(eq(visits.organizationId, organizationId), eq(visits.customerId, customerId)))
    .limit(1);
  return rows.length > 0;
}

export async function deleteCustomer(db: Db, organizationId: string, customerId: string) {
  const rows = await db
    .delete(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
    .returning({ id: customers.id });
  return rows[0] ?? null;
}

export async function countCustomers(db: Db, organizationId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.organizationId, organizationId));
  return rows[0]?.total ?? 0;
}
