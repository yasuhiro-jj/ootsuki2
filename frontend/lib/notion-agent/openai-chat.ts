/**
 * OpenAI Chat Completions を呼び、Notion のデータをコンテキストにして回答を生成する。
 * fetch のみで実装（追加パッケージ不要）。
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `あなたは静岡県富士市にある「食事処おおつき」の AI コンシェルジュです。
地元に根ざした温かみのある和食処として、常連にも初めてのお客様にも親しみやすく丁寧に対応します。

## 最優先（事実・ハルシネーション防止）
- 直後に渡す「Notion データ」が唯一の公式情報です。メニュー名・価格・営業時間・住所・電話番号は、そのデータに **文字として現れたものだけ** を使う。
- データにないメニュー・価格・時間・数値を **推測・補完・でっち上げしない**。「データに記載がありません」→「お電話でご確認ください」と案内する。
- データが空や不足している場合は、断定的な具体表現を避け、確認の案内をする。

## 性格・話し方
- 敬語ベースだが堅すぎない丁寧語
- 長すぎない返答（目安: 3〜5 文。詳細を求められたら長くてよい）
- 絵文字は控えめに（食べ物系は可）

## できること
- メニュー紹介・おすすめ（データにある候補の中から）
- 店舗情報の案内（データに基づく範囲）
- 予約・問い合わせは電話・来店を案内

## 会話ルール
- 会話の流れを踏まえて返答する
- 「おすすめ」はデータに列挙されたメニューから複数提案する
- 雑談や世間話にも軽く応じる（長引く場合は店の話題に戻す）

## 注意
- 競合店の悪口は言わない。医療・法律の助言はしない。
- 日本語で応答する。`;

function getTemperature(): number {
  const raw = process.env.OPENAI_TEMPERATURE?.trim();
  if (!raw) return 0.55;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : 0.55;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function generateReply(params: {
  userMessage: string;
  notionContext: string;
  conversationHistory?: ChatMessage[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY が未設定です');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const extra = process.env.OPENAI_SYSTEM_EXTRA?.trim();
  if (extra) {
    messages.push({ role: 'system', content: extra });
  }

  if (params.notionContext) {
    messages.push({
      role: 'system',
      content: `【Notion から取得したデータ（唯一の根拠）】\n以下の内容のみを事実として扱ってください。\n\n${params.notionContext}`,
    });
  }

  if (params.conversationHistory) {
    messages.push(...params.conversationHistory);
  }

  messages.push({ role: 'user', content: params.userMessage });

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: getTemperature(),
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[openai-chat] Error:', res.status, text);
    throw new Error(`OpenAI API エラー (${res.status})`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('OpenAI から空の返答が返りました');
  }

  return reply;
}
