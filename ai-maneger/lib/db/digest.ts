const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DIGEST_SYSTEM_PROMPT = `あなたは経営記録の要約担当者です。
提供された会話ログを分析し、重要な経営上の議論・判断・施策・数値を以下の形式で日本語で要約してください。
情報がない項目は「特になし」と書いてください。

## 期間の概要
（主な相談テーマを2〜3文で）

## 重要な経営判断・施策
- （箇条書き）

## 言及された数値・KPI
- （箇条書き）

## 次期への引き継ぎ事項
- （箇条書き）`;

const MAX_LOG_MESSAGES = 120;
const MAX_MESSAGE_CHARS = 400;

type ConversationEntry = {
  role: string;
  content: string;
  agentName: string;
  createdAt: string;
};

export async function generateDigestSummary(params: {
  conversations: ConversationEntry[];
  periodStart: string;
  periodEnd: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const logLines = params.conversations
    .slice(0, MAX_LOG_MESSAGES)
    .map((c) => {
      const date = c.createdAt.slice(0, 16).replace("T", " ");
      const speaker = c.role === "user" ? "ユーザー" : `AI${c.agentName ? `[${c.agentName}]` : ""}`;
      const text = c.content.slice(0, MAX_MESSAGE_CHARS);
      return `[${date}] ${speaker}: ${text}`;
    })
    .join("\n");

  const userPrompt = `対象期間: ${params.periodStart} 〜 ${params.periodEnd}\n会話件数: ${params.conversations.length}件\n\n${logLines}`;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: DIGEST_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API エラー (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("OpenAI から空の返答が返りました");
  return summary;
}
