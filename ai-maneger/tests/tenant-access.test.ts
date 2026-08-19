import assert from "node:assert/strict";
import test from "node:test";
import {
  __setEvaluateTenantAccessForTest,
  getCurrentTenantAccessResult,
} from "../lib/api/tenant-access";

test("getCurrentTenantAccessResult returns ok:false when tenant access evaluation rejects", async (t) => {
  __setEvaluateTenantAccessForTest(async () => {
    throw new Error("simulated db failure");
  });
  t.after(() => __setEvaluateTenantAccessForTest(null));

  const result = await getCurrentTenantAccessResult("read", {
    headers: new Headers({
      "x-auth-user": "user-1",
      "x-tenant-key": "demo",
    }),
    cookies: {
      get() {
        return undefined;
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected tenant access to be denied");
  }
  assert.equal(result.status, 500);
  assert.equal(result.tenant, null);
  assert.equal(result.principalId, null);
});
