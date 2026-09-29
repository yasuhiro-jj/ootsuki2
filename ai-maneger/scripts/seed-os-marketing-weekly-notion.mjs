/**
 * おおつき Instagram/MEO 週次DB の ID と初期行（2026-09-29）の参照。
 * DB 作成・初回行投入は Notion 上で完了済みの場合、このスクリプトは再投入用。
 *
 * 使い方:
 *   NOTION_API_KEY=... node scripts/seed-os-marketing-weekly-notion.mjs
 *
 * Vercel では NOTION_OOTSUKI_INSTAGRAM_WEEKLY_DB_ID / NOTION_OOTSUKI_MEO_WEEKLY_DB_ID を任意で設定。
 */

const INSTAGRAM_DB_ID = "95dec78deaa84f15a0def2701754530a";
const MEO_DB_ID = "7e61ad73b6124c4a9ba941a205bd3bb2";

const SEED_INSTAGRAM = {
  parent: { database_id: INSTAGRAM_DB_ID },
  properties: {
    Name: { title: [{ text: { content: "2026-09-29 週次スナップショット" } }] },
    取得日: { date: { start: "2026-09-29" } },
    閲覧数30日: { number: 10000 },
    閲覧_フォロワー率: { number: 80.7 },
    閲覧_非フォロワー率: { number: 19.3 },
    閲覧者数: { number: 814 },
    インタラクション: { number: 601 },
    インタラクション_フォロワー率: { number: 93 },
    インタラクション_非フォロワー率: { number: 7 },
    アクションアカウント: { number: 84 },
    プロフィールアクセス: { number: 205 },
    外部リンクタップ: { number: 4 },
    住所タップ: { number: 2 },
    フォロワー: { number: 731 },
    投稿閲覧率: { number: 88.7 },
    リール閲覧率: { number: 6.1 },
    ストーリーズ閲覧率: { number: 5.1 },
    投稿日リスト: { rich_text: [{ text: { content: "2026-09-23, 2026-09-16, 2026-09-09, 2026-08-28" } }] },
    アクティブ時間帯: {
      rich_text: [
        {
          text: {
            content: "0時153, 3時168, 6時124, 9時44, 12時76, 15時147, 18時143, 21時138",
          },
        },
      ],
    },
    ソース: { rich_text: [{ text: { content: "Instagramアプリ手入力（API差し替え前）" } }] },
  },
};

const SEED_MEO = {
  parent: { database_id: MEO_DB_ID },
  properties: {
    Name: { title: [{ text: { content: "2026-09-29 週次スナップショット" } }] },
    取得日: { date: { start: "2026-09-29" } },
    口コミ評価: { number: 3.6 },
    口コミ件数: { number: 55 },
    低評価30日: { number: 3 },
    低評価内訳: { rich_text: [{ text: { content: "★1: 9/22, 9/1 / ★2: 9/14" } }] },
    未返信: { number: 13 },
    表示回数: { number: 1030 },
    前月表示回数: { number: 1720 },
    ルート検索: { number: 163 },
    電話タップ: { number: 89 },
    サイトクリック: { number: 134 },
    表示月: { rich_text: [{ text: { content: "2026年8月" } }] },
    MEOスコア: { number: 32 },
    プロフィール診断: { number: 43 },
    順位キーワード: { rich_text: [{ text: { content: "富士市 食事 ランチ" } }] },
    順位: { number: 14 },
    "1位店舗": { rich_text: [{ text: { content: "ごはんや よつは" } }] },
    ソース: { rich_text: [{ text: { content: "MEO Auto Assistant 画面値（表示/経路は推定）" } }] },
  },
};

async function createPage(token, body) {
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const token = process.env.NOTION_API_KEY || process.env.NOTION_API_TOKEN;
  if (!token) {
    console.log("Instagram週次DB:", INSTAGRAM_DB_ID);
    console.log("MEO週次DB:", MEO_DB_ID);
    console.log("NOTION_API_KEY を設定すると初期行を再作成できます。");
    process.exit(0);
  }
  const ig = await createPage(token, SEED_INSTAGRAM);
  const meo = await createPage(token, SEED_MEO);
  console.log("Created Instagram row:", ig.url);
  console.log("Created MEO row:", meo.url);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
