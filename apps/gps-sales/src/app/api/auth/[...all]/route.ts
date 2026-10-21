import { getAuth } from "@/lib/auth/config";
import { toErrorResponse } from "@/lib/errors";
import { toNextJsHandler } from "better-auth/next-js";
import { connection } from "next/server";

async function handle(request: Request) {
  try {
    await connection();
    if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET || !process.env.BETTER_AUTH_URL) {
      return Response.json(
        { error: { code: "not_configured", message: "認証の環境変数が未設定です" } },
        { status: 503 },
      );
    }
    const handlers = toNextJsHandler(getAuth().handler);
    if (request.method === "POST") return handlers.POST(request);
    return handlers.GET(request);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return toErrorResponse(error);
  }
}

export { handle as GET, handle as POST };
