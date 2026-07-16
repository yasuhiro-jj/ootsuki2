import type { ConversationNode, ParsedRequest } from '@/types/chat';

export function chooseNodeForRecommend(
  message: string,
  nodes: ConversationNode[],
  parsed: ParsedRequest
): ConversationNode | null {
  const lower = message.toLowerCase();

  const scored = nodes
    .filter((node) => !isInactive(node))
    .map((node) => {
      let score = node.priority ?? 0;

      for (const word of node.triggerWords ?? []) {
        if (word && lower.includes(word.toLowerCase())) score += 10;
      }

      for (const word of node.negativeKeywords ?? []) {
        if (word && lower.includes(word.toLowerCase())) score -= 50;
      }

      if (parsed.timeContext === 'lunch' && node.nodeName === 'lunch_special_flow') score += 20;
      if (parsed.drinkContext && node.nodeName === 'beer_pairing_flow') score += 20;
      if (!parsed.drinkContext && /おすすめ|オススメ|人気/.test(message) && node.nodeName === 'smalltalk_flow') {
        score += 10;
      }

      return { node, score };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.node ?? null;
}

function isInactive(node: ConversationNode): boolean {
  const status = node.status.toLowerCase();
  return ['inactive', 'archived', 'disabled', 'off', '停止', '無効'].some((word) => status.includes(word));
}
