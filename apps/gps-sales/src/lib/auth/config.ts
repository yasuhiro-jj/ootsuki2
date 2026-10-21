import { getDb } from "@/db/client";
import { account, session, user, verification } from "@/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

/**
 * Better Auth owns `user`, `session`, `account`, and `verification`.
 * Organization membership lives in `memberships` and is not the organization plugin.
 */
function buildAuth() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) {
    throw new Error("BETTER_AUTH_URL is not set");
  }
  return betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof buildAuth> | undefined;

export function getAuth() {
  instance ??= buildAuth();
  return instance;
}
