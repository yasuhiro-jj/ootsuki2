import assert from "node:assert/strict";
import test from "node:test";

import {
  SEGMENT_GROWTH,
  SEGMENT_SIGNATURE,
  buildCustomerReason,
  containsForbiddenExpression,
  generateChatbotStrategy,
} from "../lib/chatbot-strategy/generate";
import {
  buildMenuIndex,
  matchMenuEntry,
  normalizeProductName,
  type MenuEntry,
} from "../lib/chatbot-strategy/menu-match";

const NOW = new Date("2026-10-06T14:30:00.000Z");

function menuEntry(overrides: Partial<MenuEntry> & { name: string }): MenuEntry {
  return {
    pageId: overrides.pageId ?? `page_${overrides.name}`,
    name: overrides.name,
    recommendable: overrides.recommendable ?? true,
    oneLiner: overrides.oneLiner ?? "",
    recommendation: overrides.recommendation ?? "",
  };
}

function product(name: string, marginRate: number, salesQty: number) {
  return { name, avgPrice: 1000, estCost: 400, salesQty, marginRate };
}

function makeOptions(overrides: Record<string, unknown> = {}) {
  // 粗利順位: 馬刺し1 / 出汁巻き2 / 刺身3 / 冷奴4 / 漬物5
  // 数量順位: 馬刺し1 / 刺身2 / 冷奴3 / 漬物4 / 出汁巻き5
  //   → 馬刺し=看板、出汁巻き=育成（高粗利だが売れていない）、刺身=売れ筋
  const products = [
    product("馬刺し赤身", 70, 100),
    product("出汁巻き玉子", 65, 5),
    product("刺身盛り合わせ", 60, 80),
    product("冷奴", 30, 60),
    product("漬物盛り", 20, 10),
  ];
  const menu = products.map((item) => menuEntry({ name: item.name }));

  return {
    tenant: "ootsuki" as const,
    now: NOW,
    loadMonths: async () => ["2026-09"],
    loadProducts: async () => products,
    loadMenuEntries: async () => menu,
    ...overrides,
  };
}

test("normalizeProductName ignores spacing and symbols", () => {
  assert.equal(normalizeProductName("馬刺し 赤身"), normalizeProductName("馬刺し・赤身"));
  assert.equal(normalizeProductName("ﾊｲﾎﾞｰﾙ"), normalizeProductName("ハイボール"));
});

test("matchMenuEntry finds an entry regardless of spacing", () => {
  const index = buildMenuIndex([menuEntry({ name: "馬刺し 赤身" })]);
  assert.ok(matchMenuEntry(index, "馬刺し赤身"));
  assert.equal(matchMenuEntry(index, "存在しない商品"), null);
});

test("buildMenuIndex prefers a recommendable entry when names collide", () => {
  const index = buildMenuIndex([
    menuEntry({ name: "冷奴", pageId: "blocked", recommendable: false }),
    menuEntry({ name: "冷奴", pageId: "ok", recommendable: true }),
  ]);
  assert.equal(matchMenuEntry(index, "冷奴")?.pageId, "ok");
});

test("generates ranked products with segments", async () => {
  const result = await generateChatbotStrategy(makeOptions());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const products = result.payload.priority_products;
  assert.ok(products.length > 0);
  assert.equal(products[0].product_name, "馬刺し赤身");
  assert.equal(products[0].gross_margin_rank, 1);
  assert.equal(products[0].sales_qty_rank, 1);
  assert.equal(products[0].segment, SEGMENT_SIGNATURE);
  assert.equal(products[0].priority, 90);
  assert.equal(products[0].candidate_count, 5);
});

test("high margin but low volume product becomes a growth item", async () => {
  const result = await generateChatbotStrategy(makeOptions());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const growth = result.payload.priority_products.find(
    (item) => item.product_name === "出汁巻き玉子",
  );
  assert.ok(growth);
  assert.equal(growth?.segment, SEGMENT_GROWTH);
});

test("respects the maximum product count", async () => {
  const result = await generateChatbotStrategy(makeOptions({ maxProducts: 2 }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.priority_products.length, 2);
});

test("excludes products whose menu flags are off", async () => {
  const menu = [
    menuEntry({ name: "馬刺し赤身", recommendable: false }),
    menuEntry({ name: "刺身盛り合わせ" }),
    menuEntry({ name: "出汁巻き玉子" }),
    menuEntry({ name: "冷奴" }),
    menuEntry({ name: "漬物盛り" }),
  ];
  const result = await generateChatbotStrategy(
    makeOptions({ loadMenuEntries: async () => menu }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const names = result.payload.priority_products.map((item) => item.product_name);
  assert.ok(!names.includes("馬刺し赤身"));
  assert.equal(result.sourceSummary.excluded_by_menu_flag_count, 1);
});

test("excludes products listed in the exclusion list", async () => {
  const result = await generateChatbotStrategy(
    makeOptions({ exclusions: [{ productName: "馬刺し 赤身" }] }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const names = result.payload.priority_products.map((item) => item.product_name);
  assert.ok(!names.includes("馬刺し赤身"));
  assert.equal(result.sourceSummary.excluded_by_list_count, 1);
});

test("counts products missing from the menu database", async () => {
  const result = await generateChatbotStrategy(
    makeOptions({ loadMenuEntries: async () => [menuEntry({ name: "馬刺し赤身" })] }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sourceSummary.menu_unmatched_count, 4);
});

test("fails when the ABC analysis database is empty", async () => {
  const result = await generateChatbotStrategy(makeOptions({ loadMonths: async () => [] }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "abc_analysis_empty");
});

test("fails when the latest month is too old", async () => {
  const result = await generateChatbotStrategy(
    makeOptions({ loadMonths: async () => ["2026-01"] }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "abc_analysis_stale");
});

test("fails when every candidate is excluded", async () => {
  const menu = ["馬刺し赤身", "刺身盛り合わせ", "出汁巻き玉子", "冷奴", "漬物盛り"].map((name) =>
    menuEntry({ name, recommendable: false }),
  );
  const result = await generateChatbotStrategy(
    makeOptions({ loadMenuEntries: async () => menu }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "no_recommendable_products");
});

test("drinks are filtered out before ranking", async () => {
  const result = await generateChatbotStrategy(
    makeOptions({
      loadProducts: async () => [product("中生ビール", 80, 500), product("馬刺し赤身", 70, 100)],
      loadMenuEntries: async () => [
        menuEntry({ name: "中生ビール" }),
        menuEntry({ name: "馬刺し赤身" }),
      ],
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const names = result.payload.priority_products.map((item) => item.product_name);
  assert.ok(!names.includes("中生ビール"));
});

test("customer reason never contains margin wording or numbers", async () => {
  const result = await generateChatbotStrategy(makeOptions());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const item of result.payload.priority_products) {
    assert.ok(item.customer_reason.length > 0);
    assert.ok(
      !containsForbiddenExpression(item.customer_reason),
      `customer_reason に出してはいけない表現が含まれています: ${item.customer_reason}`,
    );
  }
});

test("internal reason keeps the numbers for staff", async () => {
  const result = await generateChatbotStrategy(makeOptions());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.payload.priority_products[0].reason, /粗利率/);
  assert.match(result.payload.priority_products[0].reason, /2026-09/);
});

test("buildCustomerReason falls back when the menu text mentions margin", () => {
  const reason = buildCustomerReason(
    menuEntry({ name: "馬刺し赤身", recommendation: "粗利が高いので推してください" }),
    SEGMENT_SIGNATURE,
  );
  assert.ok(!containsForbiddenExpression(reason));
  assert.equal(reason, "よくご注文いただいている一品です。");
});

test("buildCustomerReason uses the menu wording when it is safe", () => {
  const reason = buildCustomerReason(
    menuEntry({ name: "馬刺し赤身", recommendation: "新鮮な馬肉をさっぱりと楽しめます。" }),
    SEGMENT_SIGNATURE,
  );
  assert.equal(reason, "新鮮な馬肉をさっぱりと楽しめます。");
});

test("containsForbiddenExpression rejects digits", () => {
  assert.equal(containsForbiddenExpression("人気第1位です"), true);
  assert.equal(containsForbiddenExpression("当店のおすすめです"), false);
});

test("strategy validity window is 36 hours", async () => {
  const result = await generateChatbotStrategy(makeOptions());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const span = new Date(result.validUntil).getTime() - new Date(result.validFrom).getTime();
  assert.equal(span, 36 * 60 * 60 * 1000);
});
