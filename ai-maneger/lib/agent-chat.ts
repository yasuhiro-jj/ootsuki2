import { AGENT_TOOL_DEFINITIONS, executeAgentTool } from "@/lib/agent-tools";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_TOOL_ITERATIONS = 5;

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

type OpenAIMessage =
  | { role: "system" | "user" | "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
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
  const messages: OpenAIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (params.agentInstruction) {
    messages.push({
      role: "system",
      content: `【担当専門家の方針】\n${params.agentInstruction}`,
    });
  }

  if (params.dashboardContext) {
    messages.push({
      role: "system",
      content: `【参照コンテキスト】\n以下だけを根拠に回答してください。追加データが必要な場合はツールを呼び出してください。\n\n${params.dashboardContext}`,
    });
  }

  if (params.conversationHistory?.length) {
    messages.push(...params.conversationHistory);
  }

  messages.push({ role: "user", content: params.userMessage });

  const temperature = getTemperature();
  let iteration = 0;

  while (iteration < MAX_TOOL_ITERATIONS) {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: 2048,
        tools: AGENT_TOOL_DEFINITIONS,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[agent-chat] OpenAI error:", response.status, text);
      throw new Error(`OpenAI API エラー (${response.status})`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { role: string; content?: string | null; tool_calls?: ToolCall[] };
      }>;
    };

    const choice = data.choices?.[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage) {
      throw new Error("OpenAI から空の返答が返りました");
    }

    if (choice?.finish_reason === "tool_calls" && assistantMessage.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? "",
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        let toolResult: string;
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
          console.info(`[agent-chat] tool call: ${toolCall.function.name}`, args);
          toolResult = await executeAgentTool(toolCall.function.name, args);
        } catch (err) {
          toolResult = `ツール実行エラー: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[agent-chat] tool error: ${toolCall.function.name}`, err);
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      iteration++;
      continue;
    }

    const reply = assistantMessage.content?.trim();
    if (!reply) {
      throw new Error("OpenAI から空の返答が返りました");
    }
    return reply;
  }

  throw new Error("ツール呼び出しが上限回数に達しました。もう一度お試しください。");
}
