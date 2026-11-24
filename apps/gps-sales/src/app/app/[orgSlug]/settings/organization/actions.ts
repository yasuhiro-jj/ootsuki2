"use server";

import { AppError } from "@/lib/errors";
import { loadOrgPage } from "@/lib/org-page";
import { parseInput } from "@/lib/validation";
import { updateOrganizationSchema } from "@/modules/organizations/schemas";
import { updateOrganization } from "@/modules/organizations/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateOrganizationAction(orgSlug: string, formData: FormData) {
  const loaded = await loadOrgPage(orgSlug);
  try {
    const input = parseInput(updateOrganizationSchema, { name: formData.get("name") });
    await updateOrganization(loaded.db, loaded.user, loaded.ctx.organization.id, input);
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/app/${loaded.ctx.organization.slug}/settings/organization?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(`/app/${loaded.ctx.organization.slug}/settings/organization`);
}
