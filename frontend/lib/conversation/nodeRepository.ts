import { notionQueryDataSource } from '@/lib/notion/notionClient';
import {
  getMultiSelect,
  getNumber,
  getRelationIds,
  getRichText,
  getSelect,
  getTitle,
} from '@/lib/notion/propertyHelpers';
import type { ConversationNode } from '@/types/chat';

function nodeDataSourceId(): string {
  return process.env.NOTION_CONVERSATION_NODES_DATA_SOURCE_ID?.trim() ?? '';
}

function splitWords(text: string): string[] {
  return text
    .split(/[,\n、，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function loadConversationNodes(): Promise<ConversationNode[]> {
  const data = await notionQueryDataSource(nodeDataSourceId(), {
    page_size: 100,
  });

  return (data.results ?? []).map((page: any) => {
    const props = page.properties ?? {};
    return {
      id: page.id,
      nodeName: getTitle(props, 'ノード名（node_name）') || getTitle(props, 'Name'),
      triggerWords:
        getMultiSelect(props, 'トリガーワード（trigger_words）').length > 0
          ? getMultiSelect(props, 'トリガーワード（trigger_words）')
          : splitWords(getRichText(props, 'トリガーワード（trigger_words）')),
      negativeKeywords:
        getMultiSelect(props, 'negative_keywords').length > 0
          ? getMultiSelect(props, 'negative_keywords')
          : splitWords(getRichText(props, 'negative_keywords')),
      category: getSelect(props, 'カテゴリ（category）'),
      contextType: getSelect(props, 'context_type'),
      purpose: getRichText(props, '目的（purpose）'),
      responseTemplate: getRichText(props, '応答テンプレート（response_template）'),
      conditionText: getRichText(props, '条件（condition）'),
      timeCondition: getSelect(props, 'time_condition'),
      priority: getNumber(props, '優先度（priority）') ?? 0,
      linkedMenuIds: getRelationIds(props, '使用データ（linked_db）: メニューDB'),
      nextNodeIds: getRelationIds(props, '次のノード（next_node）'),
      status: getSelect(props, 'status'),
    } satisfies ConversationNode;
  });
}
