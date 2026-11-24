import type { Db } from "@/db/client";
import { memberships, organizations, user } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function insertOrganization(
  db: Db,
  input: { name: string; slug: string },
) {
  const rows = await db
    .insert(organizations)
    .values({ name: input.name, slug: input.slug, status: "active" })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("organization insert returned no row");
  return row;
}

export async function insertMembership(
  db: Db,
  input: {
    organizationId: string;
    userId: string;
    role: string;
    status: string;
  },
) {
  const rows = await db.insert(memberships).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("membership insert returned no row");
  return row;
}

export async function findUserByEmail(db: Db, email: string) {
  const rows = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findMembership(db: Db, organizationId: string, userId: string) {
  const rows = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMembershipsForUser(db: Db, userId: string) {
  return db
    .select({
      organizationId: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      orgStatus: organizations.status,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
}

export async function listMembers(db: Db, organizationId: string) {
  return db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
      createdAt: memberships.createdAt,
      email: user.email,
      name: user.name,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId));
}

export async function countActiveOwners(db: Db, organizationId: string): Promise<number> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.role, "owner"),
        eq(memberships.status, "active"),
      ),
    );
  return rows.length;
}

export async function lockActiveOwners(db: Db, organizationId: string): Promise<void> {
  await db.execute(
    sql`select user_id from memberships where organization_id = ${organizationId} and role = 'owner' and status = 'active' for update`,
  );
}

export async function updateOrganizationName(db: Db, organizationId: string, name: string) {
  const rows = await db
    .update(organizations)
    .set({ name, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId))
    .returning();
  return rows[0] ?? null;
}

export async function updateMembership(
  db: Db,
  organizationId: string,
  userId: string,
  patch: { role?: string; status?: string },
) {
  const rows = await db
    .update(memberships)
    .set(patch)
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)),
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteMembership(db: Db, organizationId: string, userId: string) {
  const rows = await db
    .delete(memberships)
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)),
    )
    .returning({ userId: memberships.userId });
  return rows[0] ?? null;
}
