import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

/**
 * Loaded only by `auth generate`. Not imported by the Next.js app.
 * Schema output is committed; this file does not connect when generate
 * is invoked with --adapter drizzle (no queries).
 */
const secret = process.env.AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("AUTH_SECRET must be set to at least 32 characters");
}

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/gps_sales_unconfigured";

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3003",
  database: drizzleAdapter(drizzle(new Pool({ connectionString: databaseUrl })), {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
});
