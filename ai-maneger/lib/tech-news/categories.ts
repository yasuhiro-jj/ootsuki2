import type { TechCategory } from "./types";

export const CATEGORY_LABEL: Record<TechCategory, string> = {
  ai: "AI",
  frontend: "フロントエンド",
  backend: "バックエンド",
  career: "キャリア",
  gadget: "ガジェット",
};

export const WHY_IT_MATTERS: Record<TechCategory, string> = {
  ai: "モデルやツールの名前と何が変わったかだけ押さえる。今すぐ全部は試さない。",
  frontend: "UI とフレームワークの潮流。実装が必要になるまで深追いしない。",
  backend: "API・データ・インフラの変化。採用判断は必要になったときに行う。",
  career: "働き方とソフトスキルの流れ。特定技術の解説書の代わりに概要だけ見る。",
  gadget: "端末やチップの話題。開発環境に効くものだけ、あとで元記事を開く。",
};

const KEYWORDS: Record<TechCategory, string[]> = {
  ai: [
    "ai",
    "llm",
    "gpt",
    "claude",
    "gemini",
    "openai",
    "anthropic",
    "chatgpt",
    "copilot",
    "生成ai",
    "生成AI",
    "機械学習",
    "エージェント",
    "agent",
    "モデル",
  ],
  frontend: [
    "react",
    "next.js",
    "nextjs",
    "css",
    "frontend",
    "フロントエンド",
    "vue",
    "svelte",
    "typescript",
    "javascript",
    "ブラウザ",
  ],
  backend: [
    "api",
    "postgres",
    "database",
    "kubernetes",
    "backend",
    "バックエンド",
    "rust",
    "golang",
    "docker",
    "サーバ",
    "サーバー",
    "インフラ",
    "graphql",
  ],
  career: [
    "career",
    "キャリア",
    "hiring",
    "layoff",
    "転職",
    "採用",
    "年収",
    "remote",
    "働き方",
  ],
  gadget: [
    "iphone",
    "android",
    "pixel",
    "gadget",
    "hardware",
    "macbook",
    "gpu",
    "半導体",
    "apple",
    "ガジェット",
    "チップ",
  ],
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(text: string, word: string) {
  if (/[^\u0000-\u007f]/.test(word)) return text.includes(word);
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(word.toLowerCase())}(?:$|[^a-z0-9])`, "i");
  return pattern.test(text);
}

export function classifyTechTopic(text: string, hint?: TechCategory | null): TechCategory | null {
  const scores = TECH_SCORE_ORDER.map((category) => ({
    category,
    score: KEYWORDS[category].reduce((sum, word) => sum + (matchesKeyword(text, word) ? 1 : 0), 0),
  }));
  const best = scores.reduce((top, row) => (row.score > top.score ? row : top));
  if (best.score === 0) return null;
  if (hint && scores.find((row) => row.category === hint)?.score === best.score) return hint;
  return best.category;
}

const TECH_SCORE_ORDER: TechCategory[] = ["ai", "frontend", "backend", "career", "gadget"];
