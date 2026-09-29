import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { notionPageToArticle, snapshotFromNotionPages } from "../lib/tech-news/notion";
import { classifyTechTopic } from "../lib/tech-news/categories";
import { buildDigestCopy } from "../lib/tech-news/text";
import { parseFeedXml } from "../lib/tech-news/rss";
import { IngestError, ingestXArticles, normalizeIngestArticle } from "../lib/tech-news/ingest";
import { mergeArticles, readTechNewsStore } from "../lib/tech-news/store";
import type { TechArticle } from "../lib/tech-news/types";
import type { NotionPage } from "../types/notion";

const rss = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title><![CDATA[React 19 のフォーム]]></title>
    <link>https://example.com/react?a=1&amp;b=2</link>
    <pubDate>Mon, 28 Sep 2026 01:00:00 GMT</pubDate>
    <description><![CDATA[<p>フロントエンドのフォームが変わった。</p>]]></description>
  </item>
</channel></rss>`;

const atom = `<?xml version="1.0"?>
<feed>
  <entry>
    <title>GPT agent update</title>
    <link rel="alternate" href="https://example.com/gpt"/>
    <updated>2026-09-28T00:00:00Z</updated>
    <summary>A new coding agent model.</summary>
  </entry>
</feed>`;

function article(partial: Partial<TechArticle> & Pick<TechArticle, "id" | "url" | "sourceKind">): TechArticle {
  return {
    title: "t",
    summary: "s",
    whyItMatters: "w",
    category: "ai",
    sourceName: "src",
    publishedAt: "2026-09-28T00:00:00.000Z",
    ingestedAt: "2026-09-28T00:00:00.000Z",
    origin: partial.sourceKind === "x" ? "grok_bot" : "rss",
    ...partial,
  };
}

test("RSS と Atom から見出しとリンクを取る", () => {
  const items = parseFeedXml(rss);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "React 19 のフォーム");
  assert.equal(items[0].link, "https://example.com/react?a=1&b=2");
  assert.match(items[0].excerpt, /フォーム/);
  assert.ok(items[0].publishedAt);

  const atoms = parseFeedXml(atom);
  assert.equal(atoms[0].link, "https://example.com/gpt");
  assert.equal(atoms[0].title, "GPT agent update");
});

test("カテゴリは語境界で判定し、短い語の部分一致は捨てる", () => {
  assert.equal(classifyTechTopic("available email container"), null);
  assert.equal(classifyTechTopic("OpenAI ships a new GPT model"), "ai");
  assert.equal(classifyTechTopic("Next.js app router"), "frontend");
  assert.equal(classifyTechTopic("雑談", "gadget"), null);
  assert.equal(classifyTechTopic("新しい GPU チップ", "ai"), "gadget");
});

test("英語記事は日本語の案内を付け、日本語記事はそのまま要約する", () => {
  const english = buildDigestCopy({
    title: "New GPU chip",
    excerpt: "A faster chip for local models.",
    sourceName: "Engadget",
    category: "gadget",
  });
  assert.match(english.summary, /Engadgetより/);
  assert.match(english.whyItMatters, /端末/);

  const japanese = buildDigestCopy({
    title: "現場の働き方",
    excerpt: "キャリアの話として、必要なときだけキャッチアップする。",
    sourceName: "Zenn",
    category: "career",
  });
  assert.match(japanese.summary, /キャッチアップ/);
});

test("同じ URL は後着で上書きし、種別ごとに上限を超えない", () => {
  const first = article({ id: "a", url: "https://example.com/a", sourceKind: "media", summary: "old" });
  const next = article({
    id: "a",
    url: "https://example.com/a",
    sourceKind: "media",
    summary: "new",
    ingestedAt: "2026-09-29T00:00:00.000Z",
  });
  const merged = mergeArticles([first], [next]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].summary, "new");
});

test("X 取り込みは不正 URL を拒否し、正しい記事は保存する", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tech-news-"));
  process.env.TECH_NEWS_STORE_PATH = path.join(dir, "store.json");
  try {
    assert.throws(
      () =>
        normalizeIngestArticle(
          {
            title: "x",
            summary: "要約",
            category: "ai",
            url: "javascript:alert(1)",
          },
          "2026-09-29T00:00:00.000Z",
        ),
      IngestError,
    );

    const saved = await ingestXArticles([
      {
        title: "Claude のコードエージェントが話題",
        summary: "X では実装例より、何が変わったかの要約が広がっている。",
        category: "ai",
        sourceName: "X",
        url: "https://x.com/example/status/1",
        publishedAt: "2026-09-29T01:00:00Z",
      },
    ]);
    assert.equal(saved.saved, 1);
    const store = await readTechNewsStore();
    assert.equal(store.articles[0].sourceKind, "x");
    assert.equal(store.articles[0].origin, "grok_bot");
    assert.equal(store.lastXSyncAt, saved.lastXSyncAt);
  } finally {
    delete process.env.TECH_NEWS_STORE_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});

function notionPage(partial: {
  id: string;
  title: string;
  url: string;
  category: string;
  lane: string;
  publishedAt: string;
  createdAt: string;
}): NotionPage {
  return {
    id: partial.id,
    created_time: partial.createdAt,
    last_edited_time: partial.createdAt,
    properties: {
      見出し: { title: [{ plain_text: partial.title }] },
      要約: { rich_text: [{ plain_text: "要約です。" }] },
      概要だけでよい理由: { rich_text: [{ plain_text: "今は概要だけでよい。" }] },
      カテゴリ: { select: { name: partial.category } },
      欄: { select: { name: partial.lane } },
      ソース: { rich_text: [{ plain_text: "Cloudflare" }] },
      URL: { url: partial.url },
      投稿日時: { date: { start: partial.publishedAt } },
    },
  };
}

test("Notion のテックニュース行を X と RSS に分ける", () => {
  const snapshot = snapshotFromNotionPages([
    notionPage({
      id: "x1",
      title: "CloudflareがCLIを公開",
      url: "https://blog.cloudflare.com/cloudflare-cf-cli-launch/",
      category: "backend",
      lane: "X",
      publishedAt: "2026-09-28T15:30:00.000Z",
      createdAt: "2026-09-29T09:55:34.000Z",
    }),
    notionPage({
      id: "rss1",
      title: "公式ブログ",
      url: "https://example.com/rss",
      category: "ai",
      lane: "RSS",
      publishedAt: "2026-09-29 01:00:00Z",
      createdAt: "2026-09-29T02:00:00.000Z",
    }),
    notionPage({
      id: "bad",
      title: "対象外",
      url: "https://example.com/bad",
      category: "other",
      lane: "X",
      publishedAt: "2026-09-29T00:00:00.000Z",
      createdAt: "2026-09-29T00:00:00.000Z",
    }),
  ]);

  assert.equal(snapshot.xCount, 1);
  assert.equal(snapshot.mediaCount, 1);
  assert.equal(snapshot.articles[0].category, "ai");
  assert.equal(snapshot.articles[0].sourceKind, "media");
  assert.equal(snapshot.articles[1].origin, "grok_bot");
  assert.equal(snapshot.articles[1].publishedAt, "2026-09-28T15:30:00.000Z");
  assert.equal(snapshot.lastXSyncAt, "2026-09-29T09:55:34.000Z");
  assert.equal(snapshot.notionUrl, "https://app.notion.com/p/7c98ce4de1554c6388ec3118264933a9");
  assert.equal(
    notionPageToArticle(
      notionPage({
        id: "bad2",
        title: "",
        url: "https://example.com/empty",
        category: "ai",
        lane: "X",
        publishedAt: "2026-09-29T00:00:00.000Z",
        createdAt: "2026-09-29T00:00:00.000Z",
      }),
    ),
    null,
  );
});
