"use server";

import { AppError } from "@/lib/errors";
import { loadOrgPage } from "@/lib/org-page";
import { parseInput } from "@/lib/validation";
import { updateCustomerSchema } from "@/modules/customers/schemas";
import { deleteOrgCustomer, updateOrgCustomer } from "@/modules/customers/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateCustomerAction(orgSlug: string, customerId: string, formData: FormData) {
  const loaded = await loadOrgPage(orgSlug);
  try {
    const input = parseInput(updateCustomerSchema, {
      name: String(formData.get("name") ?? ""),
    });
    await updateOrgCustomer(loaded.db, loaded.user, loaded.ctx.organization.id, customerId, input);
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/app/${loaded.ctx.organization.slug}/customers?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(`/app/${loaded.ctx.organization.slug}/customers`);
}

export async function deleteCustomerAction(orgSlug: string, customerId: string) {
  const loaded = await loadOrgPage(orgSlug);
  try {
    await deleteOrgCustomer(loaded.db, loaded.user, loaded.ctx.organization.id, customerId);
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/app/${loaded.ctx.organization.slug}/customers?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(`/app/${loaded.ctx.organization.slug}/customers`);
}
