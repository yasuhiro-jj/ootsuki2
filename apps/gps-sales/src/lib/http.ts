import type { Db } from "@/db/client";
import type { CurrentUser } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import { toErrorResponse } from "@/lib/errors";

export type HttpDeps = {
  db: Db;
  getCurrentUser: () => Promise<CurrentUser | null>;
};

export async function requireActor(deps: HttpDeps): Promise<CurrentUser> {
  const user = await deps.getCurrentUser();
  if (!user) {
    throw new AppError(401, "unauthenticated", "ログインが必要です");
  }
  return user;
}

export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return toErrorResponse(error);
  }
}
