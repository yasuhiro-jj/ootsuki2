const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = `あなたは「食事処おおつき」の運用支援AIです。
役割は、日次入力・週次レビュー・判断メモをもとに、店の数字改善と現場実行を前に進めることです。

ルール:
- 直後に渡すコンテキストだけを根拠に答える
- 数字や事実を勝手に補完しない
- 答えは日本語で簡潔に、実行順がわかる形にする
- 提案は現場で今日からできる粒度を優先する
- 不足情報がある場合は、何が足りないか明示する`;

function getTemperature() {
  const raw = process.env.OPENAI_TEMPERATURE?.trim();
  if (!raw) return 0.45;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : 0.45;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateReply(params: {
  userMessage: string;
  dashboardContext: string;
  agentInstruction?: string;
  conversationHistory?: ChatMessage[];
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が未設定です");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (params.agentInstruction) {
    messages.push({
      role: "system",
      content: `【担当専門家の方針】\n${params.agentInstruction}`,
    });
  }

  if (params.dashboardContext) {
    messages.push({
      role: "system",
      content: `【参照コンテキスト】\n以下だけを根拠に回答してください。\n\n${params.dashboardContext}`,
    });
  }

  if (params.conversationHistory?.length) {
    messages.push(...params.conversationHistory);
  }

  messages.push({ role: "user", content: params.userMessage });

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: getTemperature(),
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[agent-chat] OpenAI error:", response.status, text);
    throw new Error(`OpenAI API エラー (${response.status})`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("OpenAI から空の返答が返りました");
  }

  return reply;
}
