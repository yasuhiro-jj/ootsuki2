import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOSTED_PRIORITY,
  extractChatbotActionHints,
  extractChatbotKeywords,
  extractChatbotNodeName,
  extractChatbotPriorityIntent,
  suggestedNodePriority,
} from "../lib/marketing/chatbot-action-hints";

// 実際に生成された施策文（本番のマーケ施策司令塔より）
const RAISE_ACTION =
  "『オードブル』ノードの優先度を上げる。理由: 客単価向上のための多様なメニュー提案が必要。追加キーワード: 人気メニュー";
const MULTI_KEYWORD_ACTION =
  "『おすすめノード』の優先度を上げる。理由: おすすめメニューを強化することで、客単価向上が期待できる。追加キーワード: メニュー提案、客単価";
const KEEP_ACTION =
  "『馬刺し赤身』ノードの優先度を維持する。理由: すでに十分優先されている。追加キーワード: 人気";

test("extracts the node name from the quoted part", () => {
  assert.equal(extractChatbotNodeName(RAISE_ACTION), "オードブル");
  assert.equal(extractChatbotNodeName(MULTI_KEYWORD_ACTION), "おすすめノード");
});

test("supports the other quote style", () => {
  assert.equal(extractChatbotNodeName("「ランチ」ノードの優先度を上げる。"), "ランチ");
});

test("returns an empty string when no node name is quoted", () => {
  assert.equal(extractChatbotNodeName("メニュー提案を強化する"), "");
  assert.equal(extractChatbotNodeName(""), "");
});

test("extracts a single keyword", () => {
  assert.deepEqual(extractChatbotKeywords(RAISE_ACTION), ["人気メニュー"]);
});

test("extracts multiple keywords separated by a Japanese comma", () => {
  assert.deepEqual(extractChatbotKeywords(MULTI_KEYWORD_ACTION), ["メニュー提案", "客単価"]);
});

test("returns no keywords when the section is missing", () => {
  assert.deepEqual(extractChatbotKeywords("『ランチ』ノードの優先度を上げる。"), []);
});

test("detects whether the action raises or keeps the priority", () => {
  assert.equal(extractChatbotPriorityIntent(RAISE_ACTION), "raise");
  assert.equal(extractChatbotPriorityIntent(KEEP_ACTION), "keep");
  assert.equal(extractChatbotPriorityIntent("メニューを見直す"), "unknown");
});

test("suggests the top priority when the action raises it", () => {
  assert.equal(suggestedNodePriority("raise", 8), BOOSTED_PRIORITY);
});

test("keeps the current priority when the action only maintains it", () => {
  assert.equal(suggestedNodePriority("keep", 8), 8);
  assert.equal(suggestedNodePriority("unknown", 3), 3);
});

test("falls back to the top priority when the node has none", () => {
  assert.equal(suggestedNodePriority("keep", undefined), BOOSTED_PRIORITY);
});

test("extractChatbotActionHints returns everything the form needs", () => {
  assert.deepEqual(extractChatbotActionHints(RAISE_ACTION), {
    nodeName: "オードブル",
    keywords: ["人気メニュー"],
    priorityIntent: "raise",
  });
});
