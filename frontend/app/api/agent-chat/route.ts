import { NextResponse } from 'next/server';
import { detectChatDomain } from '@/lib/conversation/domainRouter';
import { parseUserMessage } from '@/lib/conversation/intentDetector';
import { shouldUseNotionAugmentation } from '@/lib/conversation/augmentationRouter';
import { loadConversationNodes } from '@/lib/conversation/nodeRepository';
import { chooseNodeForRecommend } from '@/lib/conversation/nodeSelector';
import { recommendMenus } from '@/lib/conversation/recommendationEngine';
import { resolveMenuReference } from '@/lib/conversation/referenceResolver';
import {
  buildAvailabilityReply,
  buildDetailReply,
  buildOrderReply,
  buildPriceReply,
  buildRecommendReply,
} from '@/lib/conversation/replyBuilder';
import { getSessionContext, saveSessionContext } from '@/lib/conversation/sessionContext';
import { extractFarmItemName } from '@/lib/farm/farmMatcher';
import {
  buildFarmDetailReply,
  buildFarmPriceReply,
  buildFarmRecommendReply,
  buildFarmSeasonReply,
  buildFarmStockReply,
} from '@/lib/farm/farmReplyBuilder';
import { getFarmItemByExactName, getRecommendedFarmItems } from '@/lib/farm/farmRepository';
import { scoreFarmItem } from '@/lib/farm/farmScorer';
import { getMenuByExactName } from '@/lib/menu/menuRepository';
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

  if (!notionToken) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing_config',
        message: 'NOTION_API_TOKEN をサーバー環境に設定してください。',
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
    const parsed = parseUserMessage(message);
    const conversationContext = getSessionContext(sessionId);
    const resolved = resolveMenuReference(parsed, conversationContext);
    const shouldAugment = shouldUseNotionAugmentation(parsed);
    const domain = detectChatDomain(message);

    if (domain === 'farm') {
      try {
        const farmName = extractFarmItemName(message);
        const farmItem = farmName ? await getFarmItemByExactName(farmName) : null;

        if (farmItem && parsed.intent === 'price_check') {
          const reply = buildFarmPriceReply(farmItem);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });

          return NextResponse.json({
            ok: true,
            source: 'notion-farm-db',
            sessionId,
            intent: 'price_check',
            farm: farmItem,
            reply,
            fallbackUsed: false,
          });
        }

        if (farmItem && (parsed.intent === 'availability_check' || parsed.asksAvailability)) {
          const reply = buildFarmStockReply(farmItem);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });

          return NextResponse.json({
            ok: true,
            source: 'notion-farm-db',
            sessionId,
            intent: 'availability_check',
            farm: farmItem,
            reply,
            fallbackUsed: false,
          });
        }

        if (farmItem && (parsed.intent === 'detail_followup' || parsed.asksDetail)) {
          const reply = /旬|収穫/.test(message) ? buildFarmSeasonReply(farmItem) : buildFarmDetailReply(farmItem);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });

          return NextResponse.json({
            ok: true,
            source: 'notion-farm-db',
            sessionId,
            intent: parsed.intent,
            farm: farmItem,
            reply,
            fallbackUsed: false,
          });
        }

        if (parsed.intent === 'recommend' || /旬|今採れる|野菜/.test(message)) {
          const items = await getRecommendedFarmItems();
          const ranked = items.sort((a, b) => scoreFarmItem(b, parsed) - scoreFarmItem(a, parsed));
          const top = ranked[0];

          if (top) {
            const reply = /旬|収穫/.test(message) ? buildFarmSeasonReply(top) : buildFarmRecommendReply(top);
            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: reply });

            return NextResponse.json({
              ok: true,
              source: 'notion-farm-db',
              sessionId,
              intent: 'recommend',
              farm: top,
              reply,
              debug: {
                candidateCount: ranked.length,
                domain,
              },
              fallbackUsed: false,
            });
          }
        }
      } catch (error) {
        console.error('[agent-chat] notion farm lookup failed', error);
      }
    }

    if (shouldAugment && parsed.intent === 'price_check' && resolved.menuName) {
      try {
        const menu = await getMenuByExactName(resolved.menuName);

        if (menu) {
          const reply = buildPriceReply(menu);
          conversationContext.lastMentionedMenuId = menu.id;
          conversationContext.lastMentionedMenuName = menu.name;
          conversationContext.lastQuotedMenuId = menu.id;
          conversationContext.lastQuotedMenuName = menu.name;
          saveSessionContext(conversationContext);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });
          sessionMetaStore.set(sessionId, { activeTopic: 'menu' });

          return NextResponse.json({
            ok: true,
            source: 'notion-menu-db',
            sessionId,
            intent: 'price_check',
            resolvedBy: resolved.resolvedBy,
            menu: {
              id: menu.id,
              name: menu.name,
              price: menu.price,
              available: menu.available,
              visible: menu.visible,
            },
            reply,
            fallbackUsed: false,
          });
        }
      } catch (error) {
        console.error('[agent-chat] notion menu price lookup failed', error);
      }
    }

    if (
      shouldAugment &&
      (parsed.intent === 'detail_followup' || parsed.intent === 'availability_check') &&
      resolved.menuName
    ) {
      try {
        const menu = await getMenuByExactName(resolved.menuName);

        if (menu) {
          const reply =
            parsed.intent === 'availability_check' || parsed.asksAvailability
              ? buildAvailabilityReply(menu)
              : buildDetailReply(menu);
          conversationContext.lastMentionedMenuId = menu.id;
          conversationContext.lastMentionedMenuName = menu.name;
          saveSessionContext(conversationContext);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });
          sessionMetaStore.set(sessionId, { activeTopic: 'menu' });

          return NextResponse.json({
            ok: true,
            source: 'notion-menu-db',
            sessionId,
            intent: parsed.intent,
            resolvedBy: resolved.resolvedBy,
            menu: {
              id: menu.id,
              name: menu.name,
              price: menu.price,
              available: menu.available,
              visible: menu.visible,
              inStock: menu.inStock,
              stockStatus: menu.stockStatus,
            },
            reply,
            fallbackUsed: false,
          });
        }
      } catch (error) {
        console.error('[agent-chat] notion menu detail lookup failed', error);
      }
    }

    if (shouldAugment && parsed.intent === 'order' && resolved.menuName) {
      try {
        const menu = await getMenuByExactName(resolved.menuName);

        if (menu) {
          const quantity = parsed.quantity ?? 1;
          const reply = buildOrderReply(menu, quantity);
          conversationContext.lastMentionedMenuId = menu.id;
          conversationContext.lastMentionedMenuName = menu.name;
          conversationContext.lastOrderedMenuId = menu.id;
          conversationContext.lastOrderedMenuName = menu.name;
          saveSessionContext(conversationContext);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });
          sessionMetaStore.set(sessionId, { activeTopic: 'order', pendingFlow: 'order' });

          return NextResponse.json({
            ok: true,
            source: 'notion-menu-db',
            sessionId,
            intent: 'order',
            resolvedBy: resolved.resolvedBy,
            order: {
              menuId: menu.id,
              menuName: menu.name,
              quantity,
            },
            reply,
            fallbackUsed: false,
          });
        }
      } catch (error) {
        console.error('[agent-chat] notion menu order lookup failed', error);
      }
    }

    if (shouldAugment && parsed.intent === 'recommend') {
      try {
        const nodes = await loadConversationNodes();
        const node = chooseNodeForRecommend(message, nodes, parsed);
        const recommendations = await recommendMenus(parsed, node);
        const top = recommendations[0];

        if (top) {
          const reply = buildRecommendReply(top, node, parsed.drinkContext);
          conversationContext.lastMentionedMenuId = top.id;
          conversationContext.lastMentionedMenuName = top.name;
          conversationContext.lastRecommendedMenuId = top.id;
          conversationContext.lastRecommendedMenuName = top.name;
          saveSessionContext(conversationContext);
          history.push({ role: 'user', content: message });
          history.push({ role: 'assistant', content: reply });
          sessionMetaStore.set(sessionId, { activeTopic: 'recommendation' });

          return NextResponse.json({
            ok: true,
            source: 'notion-node-and-menu-db',
            sessionId,
            intent: 'recommend',
            node: node
              ? {
                  nodeName: node.nodeName,
                  purpose: node.purpose,
                  category: node.category,
                  contextType: node.contextType,
                }
              : null,
            menu: {
              id: top.id,
              name: top.name,
              price: top.price,
              reason: top.recommendationReason,
            },
            reply,
            fallbackUsed: false,
          });
        }
      } catch (error) {
        console.error('[agent-chat] notion recommendation lookup failed', error);
      }
    }

    if (parsed.explicitMenuName) {
      try {
        const menu = await getMenuByExactName(parsed.explicitMenuName);
        if (menu) {
          conversationContext.lastMentionedMenuId = menu.id;
          conversationContext.lastMentionedMenuName = menu.name;
          saveSessionContext(conversationContext);
        }
      } catch (error) {
        console.error('[agent-chat] notion mention lookup failed', error);
      }
    }

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

    if (!openaiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_config',
          message: 'OPENAI_API_KEY をサーバー環境に設定してください。',
        } satisfies AgentChatErrorResponse,
        { status: 503 }
      );
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
