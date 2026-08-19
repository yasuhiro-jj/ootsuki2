import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostgresConnectionString } from "../lib/db";

test("resolvePostgresConnectionString preserves postgresql protocol when DNS lookup succeeds", async () => {
  const resolved = await resolvePostgresConnectionString("postgresql://user:pass@127.0.0.1:5432/app");

  assert.match(resolved, /^postgresql:\/\//);
  assert.doesNotMatch(resolved, /^http:\/\//);
});
