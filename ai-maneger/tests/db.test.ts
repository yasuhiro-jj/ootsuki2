import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostgresPoolOptions } from "../lib/db";

test("resolvePostgresPoolOptions splits the connection string into pg options", async () => {
  const options = await resolvePostgresPoolOptions("postgresql://user:pass@127.0.0.1:5432/app");

  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 5432);
  assert.equal(options.user, "user");
  assert.equal(options.password, "pass");
  assert.equal(options.database, "app");
});

test("resolvePostgresPoolOptions never wraps an IPv6 host in brackets", async () => {
  const options = await resolvePostgresPoolOptions("postgresql://user:pass@[::1]:5432/app");

  assert.doesNotMatch(options.host, /[[\]]/);
});
