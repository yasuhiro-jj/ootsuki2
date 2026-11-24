import { getDb } from "@/db/client";
import type { AppDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import type { CurrentUser } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import { requireActiveOrgBySlug, type OrgContext } from "@/modules/access/context";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export async function loadOrgPage(slug: string): Promise<{
  user: CurrentUser;
  ctx: OrgContext;
  db: AppDatabase;
}> {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const ctx = await requireActiveOrgBySlug(getDb(), user.id, slug);
    return { user, ctx, db: getDb() };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.status === 404) redirect("/select-organization");
      redirect(`/select-organization?notice=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}
