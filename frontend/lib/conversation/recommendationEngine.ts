import { getMenuByPageId, searchRecommendableMenus } from '@/lib/menu/menuRepository';
import { scoreMenu } from '@/lib/menu/menuScorer';
import type { ConversationNode, MenuRecord, ParsedRequest } from '@/types/chat';

export async function recommendMenus(
  parsed: ParsedRequest,
  node?: ConversationNode | null
): Promise<MenuRecord[]> {
  let menus: MenuRecord[] = [];

  if (node?.linkedMenuIds?.length) {
    const linked = await Promise.all(node.linkedMenuIds.map((id) => getMenuByPageId(id)));
    menus = linked.filter(Boolean) as MenuRecord[];
  }

  if (!menus.length) {
    menus = await searchRecommendableMenus({
      timeContext: parsed.timeContext,
      drinkContext: parsed.drinkContext,
      preferenceTags: parsed.preferenceTags,
    });
  }

  return menus.sort((a, b) => scoreMenu(b, parsed) - scoreMenu(a, parsed));
}
