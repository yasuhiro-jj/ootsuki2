import type { Db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import type { Role } from "@/lib/auth/roles";
import { isRole } from "@/lib/auth/roles";
import { AppError } from "@/lib/errors";
import { assertUuid } from "@/lib/validation";
import { and, eq } from "drizzle-orm";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type OrgContext = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: "active";
  };
  membership: {
    userId: string;
    role: Role;
    status: "active";
  };
};

export async function requireActiveOrg(
  db: Db,
  userId: string,
  organizationId: string,
): Promise<OrgContext> {
  assertUuid(organizationId);
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      orgStatus: organizations.status,
      role: memberships.role,
      membershipStatus: memberships.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)),
    )
    .limit(1);

  return assertRow(rows[0], userId);
}

export async function requireActiveOrgBySlug(
  db: Db,
  userId: string,
  slug: string,
): Promise<OrgContext> {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_RE.test(normalized)) {
    throw new AppError(404, "not_found", "組織が見つかりません");
  }
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      orgStatus: organizations.status,
      role: memberships.role,
      membershipStatus: memberships.status,
    })
    .from(organizations)
    .innerJoin(
      memberships,
      and(
        eq(memberships.organizationId, organizations.id),
        eq(memberships.userId, userId),
      ),
    )
    .where(eq(organizations.slug, normalized))
    .limit(1);

  return assertRow(rows[0], userId);
}

function assertRow(
  row:
    | {
        id: string;
        name: string;
        slug: string;
        orgStatus: string;
        role: string;
        membershipStatus: string;
      }
    | undefined,
  userId: string,
): OrgContext {
  if (!row) {
    throw new AppError(404, "not_found", "組織が見つかりません");
  }
  if (row.membershipStatus === "disabled") {
    throw new AppError(403, "membership_disabled", "この組織へのアクセスは停止されています");
  }
  if (row.membershipStatus !== "active") {
    throw new AppError(403, "membership_pending", "招待を承諾すると利用できます");
  }
  if (row.orgStatus !== "active") {
    throw new AppError(403, "organization_unavailable", "この組織は現在利用できません");
  }
  if (!isRole(row.role)) {
    throw new AppError(403, "forbidden", "権限がありません");
  }
  return {
    organization: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: "active",
    },
    membership: { userId, role: row.role, status: "active" },
  };
}
