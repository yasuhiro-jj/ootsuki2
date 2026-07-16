import type { ParsedRequest } from '@/types/chat';

export function shouldUseNotionAugmentation(parsed: ParsedRequest): boolean {
  if (parsed.intent === 'price_check') return true;
  if (parsed.intent === 'detail_followup') return true;
  if (parsed.intent === 'availability_check') return true;
  if (parsed.intent === 'recommend') return true;
  if (parsed.intent === 'order' && parsed.hasPronounReference) return true;
  if (parsed.hasRecommendedReference) return true;
  if (parsed.asksAvailability) return true;
  if (parsed.asksDetail) return true;
  if (parsed.asksPrice) return true;
  return false;
}
