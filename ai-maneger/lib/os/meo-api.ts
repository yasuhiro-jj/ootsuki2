import type { TenantKey } from "@/lib/tenant-config/types";
import type { MeoWeeklySnapshot } from "@/lib/os/meo-weekly";

/** 将来: GBP Performance API / meo 内部API。接続後はここを実装し Notion 手入力より優先する。 */
export async function loadMeoWeeklyFromApi(_tenant: TenantKey): Promise<MeoWeeklySnapshot | null> {
  return null;
}
