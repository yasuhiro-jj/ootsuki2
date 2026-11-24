/**
 * chatbot 施策の recommended_action から、反映に必要な情報を取り出す。
 *
 * 生成時のプロンプト（engine.ts の JSON_INSTRUCTION）で、chatbot 施策の
 * recommended_action は次の形式に固定されている。
 *   「『ノード名』ノードの優先度を（上げる/維持する）。理由: ...。追加キーワード: ...」
 *
 * 生成側（実在ノードの検証）と画面側（反映フォームの初期値）の両方で使うため、
 * 解析はこのファイルに集約する。
 */

/** 「優先度を上げる」と書かれた施策で設定する優先度（数値が小さいほど優先表示）。 */
export const BOOSTED_PRIORITY = 1;

export type ChatbotActionHints = {
  /** 『』または「」で囲まれたノード名。取り出せなければ空文字。 */
  nodeName: string;
  /** 「追加キーワード:」以降のキーワード。 */
  keywords: string[];
  /** 優先度をどうしたいか。判別できなければ "unknown"。 */
  priorityIntent: "raise" | "keep" | "unknown";
};

const NODE_NAME_PATTERN = /[『「]([^』」]+)[』」]/;
const KEYWORDS_PATTERN = /追加キーワード\s*[:：]\s*([^。\n]*)/;
const KEYWORD_SEPARATORS = /[、,，・\s]+/;

/** recommended_action からノード名を取り出す（見つからなければ空文字）。 */
export function extractChatbotNodeName(recommendedAction: string): string {
  const matched = String(recommendedAction || "").match(NODE_NAME_PATTERN);
  return matched?.[1]?.trim() || "";
}

/** recommended_action から追加キーワードを取り出す。 */
export function extractChatbotKeywords(recommendedAction: string): string[] {
  const matched = String(recommendedAction || "").match(KEYWORDS_PATTERN);
  if (!matched?.[1]) return [];
  return matched[1]
    .replace(/[」』]\s*$/, "")
    .split(KEYWORD_SEPARATORS)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

/** recommended_action が優先度を上げたいのか、維持したいのかを判別する。 */
export function extractChatbotPriorityIntent(
  recommendedAction: string,
): ChatbotActionHints["priorityIntent"] {
  const text = String(recommendedAction || "");
  if (/優先度を\s*維持/.test(text)) return "keep";
  if (/優先度を\s*(上げる|上げ|引き上げ)/.test(text)) return "raise";
  return "unknown";
}

export function extractChatbotActionHints(recommendedAction: string): ChatbotActionHints {
  return {
    nodeName: extractChatbotNodeName(recommendedAction),
    keywords: extractChatbotKeywords(recommendedAction),
    priorityIntent: extractChatbotPriorityIntent(recommendedAction),
  };
}

/**
 * 反映フォームに出す優先度の初期値。
 * 「上げる」なら最優先(1)、「維持」や判別不能なら現在値をそのまま使い、
 * 操作しないかぎり優先度が勝手に変わらないようにする。
 */
export function suggestedNodePriority(
  priorityIntent: ChatbotActionHints["priorityIntent"],
  currentPriority?: number,
): number {
  if (priorityIntent === "raise") return BOOSTED_PRIORITY;
  if (typeof currentPriority === "number" && Number.isFinite(currentPriority)) {
    return currentPriority;
  }
  return BOOSTED_PRIORITY;
}
