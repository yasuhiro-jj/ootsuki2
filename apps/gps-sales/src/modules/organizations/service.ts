import type { Db } from "@/db/client";
import type { CurrentUser } from "@/lib/auth/types";
import { canManageMembers, isRole, type Role } from "@/lib/auth/roles";
import { AppError } from "@/lib/errors";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/postgres";
import { requireActiveOrg, requireActiveOrgBySlug } from "@/modules/access/context";
import { writeAudit } from "@/modules/audit/repository";
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  UpdateMemberInput,
  UpdateOrganizationInput,
} from "./schemas";
import {
  countActiveOwners,
  deleteMembership,
  findMembership,
  findUserByEmail,
  insertMembership,
  insertOrganization,
  listMembers,
  listMembershipsForUser,
  lockActiveOwners,
  updateMembership,
  updateOrganizationName,
} from "./repository";

export async function createOrganization(
  db: Db,
  actor: CurrentUser,
  input: CreateOrganizationInput,
) {
  const slug = input.slug.trim().toLowerCase();
  try {
    return await db.transaction(async (tx) => {
      const organization = await insertOrganization(tx, { name: input.name.trim(), slug });
      await insertMembership(tx, {
        organizationId: organization.id,
        userId: actor.id,
        role: "owner",
        status: "active",
      });
      await writeAudit(tx, {
        organizationId: organization.id,
        actorUserId: actor.id,
        action: "organization.create",
        entityType: "organization",
        entityId: organization.id,
        details: { slug },
      });
      return organization;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "slug_taken", "このスラッグは既に使われています");
    }
    throw error;
  }
}

export async function listMyOrganizations(db: Db, actor: CurrentUser) {
  return listMembershipsForUser(db, actor.id);
}

export async function updateOrganization(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  input: UpdateOrganizationInput,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  if (!canManageMembers(ctx.membership.role)) {
    throw new AppError(403, "forbidden", "組織設定を変更する権限がありません");
  }
  return db.transaction(async (tx) => {
    const updated = await updateOrganizationName(tx, ctx.organization.id, input.name.trim());
    if (!updated) throw new AppError(404, "not_found", "組織が見つかりません");
    await writeAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: actor.id,
      action: "organization.update",
      entityType: "organization",
      entityId: ctx.organization.id,
      details: { fields: ["name"] },
    });
    return updated;
  });
}

export async function getOrganizationBySlug(db: Db, actor: CurrentUser, slug: string) {
  return requireActiveOrgBySlug(db, actor.id, slug);
}

export async function listOrganizationMembers(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  const members = await listMembers(db, ctx.organization.id);
  return { organization: ctx.organization, members };
}

export async function inviteMember(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  input: InviteMemberInput,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  if (!canManageMembers(ctx.membership.role)) {
    throw new AppError(403, "forbidden", "メンバーを招待する権限がありません");
  }
  const existingUser = await findUserByEmail(db, input.email.trim());
  if (!existingUser) {
    throw new AppError(404, "user_not_found", "そのメールアドレスのユーザーは未登録です");
  }
  const current = await findMembership(db, ctx.organization.id, existingUser.id);
  if (current && (current.status === "active" || current.status === "invited")) {
    throw new AppError(409, "already_member", "このユーザーは既に所属しています");
  }
  return db.transaction(async (tx) => {
    const membership = current
      ? await updateMembership(tx, ctx.organization.id, existingUser.id, {
          role: input.role,
          status: "invited",
        })
      : await insertMembership(tx, {
          organizationId: ctx.organization.id,
          userId: existingUser.id,
          role: input.role,
          status: "invited",
        });
    if (!membership) throw new AppError(404, "not_found", "メンバーが見つかりません");
    await writeAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: actor.id,
      action: "membership.invite",
      entityType: "membership",
      entityId: existingUser.id,
      details: { role: input.role },
    });
    return membership;
  });
}

export async function acceptInvitation(db: Db, actor: CurrentUser, organizationId: string) {
  const membership = await findMembership(db, organizationId, actor.id);
  if (!membership || membership.status !== "invited") {
    throw new AppError(404, "not_found", "招待が見つかりません");
  }
  const orgRows = await listMembershipsForUser(db, actor.id);
  const org = orgRows.find((row) => row.organizationId === organizationId);
  if (!org || org.orgStatus !== "active") {
    throw new AppError(403, "organization_unavailable", "この組織は現在利用できません");
  }
  return db.transaction(async (tx) => {
    const updated = await updateMembership(tx, organizationId, actor.id, { status: "active" });
    if (!updated) throw new AppError(404, "not_found", "招待が見つかりません");
    await writeAudit(tx, {
      organizationId,
      actorUserId: actor.id,
      action: "membership.accept",
      entityType: "membership",
      entityId: actor.id,
      details: { role: updated.role },
    });
    return updated;
  });
}

export async function updateMember(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  targetUserId: string,
  input: UpdateMemberInput,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  if (!canManageMembers(ctx.membership.role)) {
    throw new AppError(403, "forbidden", "メンバーを変更する権限がありません");
  }
  try {
    return await db.transaction(async (tx) => {
      await lockActiveOwners(tx, ctx.organization.id);
      const current = await findMembership(tx, ctx.organization.id, targetUserId);
      if (!current || !isRole(current.role)) {
        throw new AppError(404, "not_found", "メンバーが見つかりません");
      }
      const owners = await countActiveOwners(tx, ctx.organization.id);
      if (wouldRemoveLastOwner(current, input, owners)) {
        throw new AppError(409, "last_owner", "最後のオーナーは削除・降格・停止できません");
      }
      const updated = await updateMembership(tx, ctx.organization.id, targetUserId, {
        role: input.role,
        status: input.status,
      });
      if (!updated) throw new AppError(404, "not_found", "メンバーが見つかりません");
      await writeAudit(tx, {
        organizationId: ctx.organization.id,
        actorUserId: actor.id,
        action: "membership.update",
        entityType: "membership",
        entityId: targetUserId,
        details: { fields: Object.keys(input) },
      });
      return updated;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw error;
  }
}

export async function removeMember(
  db: Db,
  actor: CurrentUser,
  organizationId: string,
  targetUserId: string,
) {
  const ctx = await requireActiveOrg(db, actor.id, organizationId);
  if (!canManageMembers(ctx.membership.role)) {
    throw new AppError(403, "forbidden", "メンバーを削除する権限がありません");
  }
  try {
    return await db.transaction(async (tx) => {
      await lockActiveOwners(tx, ctx.organization.id);
      const current = await findMembership(tx, ctx.organization.id, targetUserId);
      if (!current || !isRole(current.role)) {
        throw new AppError(404, "not_found", "メンバーが見つかりません");
      }
      const owners = await countActiveOwners(tx, ctx.organization.id);
      if (wouldRemoveLastOwner(current, { status: "disabled" }, owners)) {
        throw new AppError(409, "last_owner", "最後のオーナーは削除・降格・停止できません");
      }
      const removed = await deleteMembership(tx, ctx.organization.id, targetUserId);
      if (!removed) throw new AppError(404, "not_found", "メンバーが見つかりません");
      await writeAudit(tx, {
        organizationId: ctx.organization.id,
        actorUserId: actor.id,
        action: "membership.delete",
        entityType: "membership",
        entityId: targetUserId,
        details: {},
      });
      return removed;
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new AppError(409, "membership_has_visits", "訪問履歴があるメンバーは削除できません");
    }
    throw error;
  }
}

function wouldRemoveLastOwner(
  current: { role: Role | string; status: string },
  next: { role?: string; status?: string },
  activeOwnerCount: number,
): boolean {
  const isActiveOwner = current.role === "owner" && current.status === "active";
  if (!isActiveOwner) return false;
  const nextRole = next.role ?? current.role;
  const nextStatus = next.status ?? current.status;
  const stays = nextRole === "owner" && nextStatus === "active";
  return !stays && activeOwnerCount <= 1;
}
