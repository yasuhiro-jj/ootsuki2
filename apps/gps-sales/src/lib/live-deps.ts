import { getDb } from "@/db/client";
import { AppError, toErrorResponse } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth/session";
import type { HttpDeps } from "@/lib/http";
import { connection } from "next/server";

export async function liveDeps(): Promise<HttpDeps> {
  await connection();
  if (!process.env.DATABASE_URL) {
    throw new AppError(503, "not_configured", "データベースが未設定です");
  }
  return { db: getDb(), getCurrentUser };
}

export async function withDeps(
  run: (deps: HttpDeps) => Promise<Response>,
): Promise<Response> {
  try {
    return await run(await liveDeps());
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return toErrorResponse(error);
  }
}
