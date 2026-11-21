import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` reads the TypeScript schema and writes SQL files.
 * It does not connect. Do not run `drizzle-kit push`.
 * Apply the generated SQL to a new Neon project only after review.
 */
const url =
  process.env.DATABASE_URL ?? "postgresql://127.0.0.1:5432/gps_sales";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
});
