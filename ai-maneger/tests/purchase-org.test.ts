import assert from "node:assert/strict";
import test from "node:test";
import {
  isIncludedPurchaseOrganization,
  RECEIPT_SORTER_DEV_ORG_ID,
} from "../lib/notion/purchase-org";

test("isIncludedPurchaseOrganization accepts ootsuki and receipt-sorter dev org", () => {
  assert.equal(isIncludedPurchaseOrganization(undefined), true);
  assert.equal(isIncludedPurchaseOrganization(""), true);
  assert.equal(isIncludedPurchaseOrganization("ootsuki"), true);
  assert.equal(isIncludedPurchaseOrganization(RECEIPT_SORTER_DEV_ORG_ID), true);
  assert.equal(isIncludedPurchaseOrganization("other-tenant"), false);
});