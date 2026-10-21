"use server";

import { AppError } from "@/lib/errors";
import { loadOrgPage } from "@/lib/org-page";
import { parseInput } from "@/lib/validation";
import { inviteMemberSchema, updateMemberSchema } from "@/modules/organizations/schemas";
import { inviteMember, removeMember, updateMember } from "@/modules/organizations/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function fail(slug: string, error: unknown): never {
  if (error instanceof AppError) {
    redirect(`/app/${slug}/settings/members?error=${encodeURIComponent(error.message)}`);
  }
  throw error;
}

export async function inviteMemberAction(orgSlug: string, formData: FormData) {
  const loaded = await loadOrgPage(orgSlug);
  try {
    const input = parseInput(inviteMemberSchema, {
      email: formData.get("email"),
      role: formData.get("role"),
    });
    await inviteMember(loaded.db, loaded.user, loaded.ctx.organization.id, input);
  } catch (error) {
    fail(loaded.ctx.organization.slug, error);
  }
  revalidatePath(`/app/${loaded.ctx.organization.slug}/settings/members`);
}

export async function updateMemberAction(orgSlug: string, userId: string, formData: FormData) {
  const loaded = await loadOrgPage(orgSlug);
  try {
    const input = parseInput(updateMemberSchema, {
      role: formData.get("role"),
      status: formData.get("status"),
    });
    await updateMember(loaded.db, loaded.user, loaded.ctx.organization.id, userId, input);
  } catch (error) {
    fail(loaded.ctx.organization.slug, error);
  }
  revalidatePath(`/app/${loaded.ctx.organization.slug}/settings/members`);
}

export async function removeMemberAction(orgSlug: string, userId: string) {
  const loaded = await loadOrgPage(orgSlug);
  try {
    await removeMember(loaded.db, loaded.user, loaded.ctx.organization.id, userId);
  } catch (error) {
    fail(loaded.ctx.organization.slug, error);
  }
  revalidatePath(`/app/${loaded.ctx.organization.slug}/settings/members`);
}
