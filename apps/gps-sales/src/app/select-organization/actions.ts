"use server";

import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { acceptInvitation, createOrganization } from "@/modules/organizations/service";
import { createOrganizationSchema } from "@/modules/organizations/schemas";
import { parseInput } from "@/lib/validation";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export async function createOrganizationAction(_prev: { error: string }, formData: FormData) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const input = parseInput(createOrganizationSchema, {
      name: formData.get("name"),
      slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    });
    const organization = await createOrganization(getDb(), user, input);
    redirect(`/app/${organization.slug}/dashboard`);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function acceptInvitationAction(organizationId: string, slug: string) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await acceptInvitation(getDb(), user, organizationId);
  redirect(`/app/${slug}/dashboard`);
}
