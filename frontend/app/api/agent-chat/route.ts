import { NextResponse } from 'next/server';
import { fetchNotionContext, notionContextToText } from '@/lib/notion-agent/notion-db-client';
import { generateReply, type ChatMessage } from '@/lib/notion-agent/openai-chat';
import type { AgentChatErrorResponse, AgentChatRequestBody } from '@/types/chat';

export const runtime = 'nodejs';

const sessionStore = new Map<string, ChatMessage[]>();
const sessionMetaStore = new Map<
  string,
  { activeTopic?: string; pendingFlow?: string }
>();

const LATEST_INFO_UNAVAILABLE_MESSAGE =
  '現在のリアルタイム情報にはまだ接続されていないため、今日の天気・ニュース・試合結果などを正確には確認できません。確認できる情報源を見ながらなら、一緒に整理できます。';

const STORE_KEYWORDS = [
  'おおつき',
  '大月',
  '食事処',
  '店',
  '店舗',
  'メニュー',
  '定食',
  'ランチ',
  '刺身',
  '寿司',
  '焼き鳥',
  '天ぷら',
  '弁当',
  'テイクアウト',
  '宴会',
  'コース',
  '予約',
  '飲み放題',
  '営業時間',
  '定休日',
  '場所',
  '住所',
  'アクセス',
  '駐車場',
  '電話',
  '値段',
  '価格',
  'おすすめ',
  '注文',
];

const LATEST_INFO_KEYWORDS = [
  '天気',
  'ニュース',
  '最新',
  '株価',
  '為替',
  '試合',
  '結果',
  '大谷',
];

const TIME_WORDS = ['昨日', '今日', '明日', '今朝', '今夜', 'さっき'];

const EXTERNAL_INFO_KEYWORDS = [
  '天気',
  'ニュース',
  '株価',
  '為替',
  '試合',
  '結果',
  '大谷',
  '速報',
  '順位',
];

const SMALLTALK_KEYWORDS = [
  'こんにちは',
  'こんばんは',
  'おはよう',
  'ありがとう',
  '暑い',
  '寒い',
  '疲れた',
  '眠い',
  '元気',
  '雑談',
  '聞いて',
];

const RESERVATION_FLOW_KEYWORDS = [
  '予約',
  '宴会',
  'コース',
  '飲み放題',
  '個室',
  '席',
  '人数',
  '20人',
  '10人',
];

const ORDER_FLOW_KEYWORDS = ['注文', '弁当', 'テイクアウト', '持ち帰り'];

const MENU_TOPIC_KEYWORDS = [
  'メニュー',
  '定食',
  'ランチ',
  '刺身',
  '寿司',
  '焼き鳥',
  '天ぷら',
  '値段',
  '価格',
  '料金',
  '何円',
];

const RECOMMENDATION_TOPIC_KEYWORDS = [
  'おすすめ',
  'どれがいい',
  '選んで',
  '迷って',
  '相談',
];

const QUESTION_MARKERS = [
  '?',
  '？',
  'ある',
  'あります',
  'できる',
  'できます',
  'ですか',
  'ますか',
  '何',
  'どこ',
  'いつ',
  'いくら',
  '何円',
  '教えて',
  '知りたい',
  '見せて',
];

const CASUAL_STATUS_PATTERNS = [
  '待って',
  '待ってる',
  '待っています',
  '向かって',
  '向かいます',
  '着いた',
  '着きました',
  'います',
  'いるよ',
  'いるね',
  '前にいる',
  '行くね',
  '行きます',
  'あとで',
  'また',
];

const FOLLOWUP_MARKERS = [
  'それ',
  'その',
  'さっき',
  'さっきの',
  '続き',
  '件',
  '話',
  'じゃあ',
  'じゃ',
  'あと',
  'それで',
  'ちなみに',
  'で、',
  'それなら',
  'この前',
];

const FLOW_SLOT_KEYWORDS = [
  '人',
  '名',
  '円',
  '月',
  '日',
  '時',
  '夜',
  '昼',
  '個室',
  '席',
  '飲み放題',
  'コース',
  '予算',
  '大人',
  '子ども',
];

const TOPIC_SHIFT_KEYWORDS = [
  '話変わる',
  '話を変える',
  '別件',
  'ところで',
  'それは置いといて',
  '関係ないけど',
  '予約の話はまた後で',
  'また後で',
];

const CANCEL_FLOW_KEYWORDS = [
  'やっぱりやめる',
  'やめます',
  'キャンセル',
  '取り消し',
  '中止',
  'なしで',
  'また今度',
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isContextualFollowup(message: string, text: string): boolean {
  return includesAny(text, FOLLOWUP_MARKERS) || (message.length <= 24 && !includesAny(text, QUESTION_MARKERS));
}

function isExplicitNaturalTurn(text: string): boolean {
  return includesAny(text, SMALLTALK_KEYWORDS) || includesAny(text, TOPIC_SHIFT_KEYWORDS);
}

function isFlowCancelOrPause(text: string): boolean {
  return includesAny(text, CANCEL_FLOW_KEYWORDS) || includesAny(text, TOPIC_SHIFT_KEYWORDS);
}

function classifyRoute(
  message: string,
  meta?: { activeTopic?: string; pendingFlow?: string }
): 'store' | 'natural' | 'latest' {
  const text = message.trim().toLowerCase();
  const flow = meta?.pendingFlow?.trim().toLowerCase();
  const topic = meta?.activeTopic?.trim().toLowerCase();
  const hasStoreKeyword = includesAny(text, STORE_KEYWORDS);
  const hasQuestionMarker = includesAny(text, QUESTION_MARKERS);
  const isStatusUpdate = includesAny(text, CASUAL_STATUS_PATTERNS);
  const isFollowup = isContextualFollowup(message, text);
  const isFlowSlot = includesAny(text, FLOW_SLOT_KEYWORDS);
  const hasLatestKeyword = includesAny(text, LATEST_INFO_KEYWORDS);
  const hasTimeWord = includesAny(text, TIME_WORDS);
  const hasExternalInfoKeyword = includesAny(text, EXTERNAL_INFO_KEYWORDS);

  if (['reservation', 'banquet', 'order', 'takeout'].includes(flow || '')) {
    if (isFlowCancelOrPause(text) && (hasLatestKeyword || (hasTimeWord && hasExternalInfoKeyword))) {
      return 'latest';
    }
    if (isFlowCancelOrPause(text)) return 'natural';
    if (isExplicitNaturalTurn(text)) return 'natural';
    if (isFollowup || isFlowSlot) return 'store';
  }

  if (['reservation', 'banquet', 'order', 'takeout'].includes(topic || '')) {
    if (isFlowCancelOrPause(text) && (hasLatestKeyword || (hasTimeWord && hasExternalInfoKeyword))) {
      return 'latest';
    }
    if (isFlowCancelOrPause(text)) return 'natural';
    if (isExplicitNaturalTurn(text)) return 'natural';
    if (isFollowup || isFlowSlot) return 'store';
  }

  if (['restaurant', 'menu', 'recommendation'].includes(topic || '') && isFollowup) {
    return 'store';
  }

  if (topic === 'natural' && isFollowup) return 'natural';
  if (topic === 'latest' && isFollowup) return 'latest';

  if (hasStoreKeyword && !hasQuestionMarker && isStatusUpdate) {
    return 'natural';
  }
  if (hasStoreKeyword) {
    return 'store';
  }
  if (isExplicitNaturalTurn(text)) {
    return 'natural';
  }
  if (hasLatestKeyword || (hasTimeWord && hasExternalInfoKeyword)) {
    return 'latest';
  }
  if (message.length <= 30 && !/[?？]/.test(message)) {
    return 'natural';
  }
  return 'store';
}

function updateSessionMeta(
  sessionId: string,
  message: string,
  route: 'store' | 'natural' | 'latest'
) {
  const text = message.trim().toLowerCase();
  const next = { ...(sessionMetaStore.get(sessionId) || {}) };
  if (route === 'store' && includesAny(text, RESERVATION_FLOW_KEYWORDS)) {
    next.activeTopic = 'reservation';
    next.pendingFlow = 'reservation';
  } else if (route === 'store' && includesAny(text, ORDER_FLOW_KEYWORDS)) {
    next.activeTopic = 'order';
    next.pendingFlow = 'order';
  } else if (route === 'store' && includesAny(text, MENU_TOPIC_KEYWORDS)) {
    next.activeTopic = 'menu';
  } else if (route === 'store' && includesAny(text, RECOMMENDATION_TOPIC_KEYWORDS)) {
    next.activeTopic = 'recommendation';
  } else if (route === 'store') {
    next.activeTopic = 'restaurant';
  } else if (route === 'natural') {
    next.activeTopic = 'natural';
    next.pendingFlow = undefined;
  } else if (route === 'latest') {
    next.activeTopic = 'latest';
    next.pendingFlow = undefined;
  }
  sessionMetaStore.set(sessionId, next);
}

function getOrCreateSession(id?: string): { sessionId: string; history: ChatMessage[] } {
  if (id && sessionStore.has(id)) {
    return { sessionId: id, history: sessionStore.get(id)! };
  }
  const sessionId = id || crypto.randomUUID();
  const history: ChatMessage[] = [];
  sessionStore.set(sessionId, history);
  sessionMetaStore.set(sessionId, {});
  return { sessionId, history };
}

export async function POST(request: Request) {
  let body: AgentChatRequestBody;
  try {
    body = (await request.json()) as AgentChatRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        message: 'JSON の形式が正しくありません',
      } satisfies AgentChatErrorResponse,
      { status: 400 }
    );
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        message: 'message が空です',
      } satisfies AgentChatErrorResponse,
      { status: 400 }
    );
  }

  const notionToken =
    process.env.NOTION_API_TOKEN?.trim() || process.env.NOTION_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!notionToken || !openaiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing_config',
        message: 'NOTION_API_TOKEN（or KEY）と OPENAI_API_KEY をサーバー環境に設定してください。',
      } satisfies AgentChatErrorResponse,
      { status: 503 }
    );
  }

  const { sessionId, history } = getOrCreateSession(
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : undefined
  );

  try {
    const route = classifyRoute(message, sessionMetaStore.get(sessionId));
    updateSessionMeta(sessionId, message, route);
    let contextText = '';

    if (route === 'store') {
      const ctx = await fetchNotionContext(message);
      contextText = notionContextToText(ctx);
    } else if (route === 'latest') {
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: LATEST_INFO_UNAVAILABLE_MESSAGE });

      return NextResponse.json({
        ok: true,
        reply: LATEST_INFO_UNAVAILABLE_MESSAGE,
        sessionId,
        source: 'latest-unavailable',
        fallbackUsed: false,
      });
    }

    const reply = await generateReply({
      userMessage: message,
      notionContext: contextText,
      conversationHistory: history.slice(-20),
    });

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });

    return NextResponse.json({
      ok: true,
      reply,
      sessionId,
      source: route === 'store' ? 'notion-db-openai' : 'natural-openai',
      fallbackUsed: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    console.error('[agent-chat]', e);

    return NextResponse.json(
      {
        ok: false,
        error: 'agent_failed',
        message: msg,
      } satisfies AgentChatErrorResponse,
      { status: 502 }
    );
  }
}
