import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readdirSync(path.join(process.cwd(), "src/db/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(path.join(process.cwd(), "src/db/migrations", file), "utf8"))
  .join("\n");

describe("initial migration", () => {
  it("contains the domain tables and Better Auth tables without a duplicate users table", () => {
    for (const table of [
      "organizations",
      "memberships",
      "customers",
      "visits",
      "visit_locations",
      "visit_photos",
      "visit_outcomes",
      "audit_logs",
      "plans",
      "subscriptions",
      "usage_records",
      "user",
      "session",
      "account",
      "verification",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).not.toMatch(/CREATE TABLE "users"/);
    expect(sql.toLowerCase()).not.toContain("row level security");
    expect(sql).toContain('FOREIGN KEY ("customer_id","organization_id")');
    expect(sql).toContain('FOREIGN KEY ("organization_id","staff_user_id")');
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  });
});
