import type { TenantKey } from "@/lib/tenant-config/types";
import type { InstagramWeeklySnapshot } from "@/lib/os/instagram-weekly";

/** 将来: Instagram Graph API（instagram_manage_insights）。接続後はここを実装し Notion 手入力より優先する。 */
export async function loadInstagramWeeklyFromApi(_tenant: TenantKey): Promise<InstagramWeeklySnapshot | null> {
  return null;
}
