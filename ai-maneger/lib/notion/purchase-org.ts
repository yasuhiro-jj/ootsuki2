/** receipt-sorter 開発テナント（ログイン不要モード）の organization_id */
export const RECEIPT_SORTER_DEV_ORG_ID = "00000000-0000-0000-0000-000000000000";

const ALLOWED_ORGANIZATION_IDS = new Set(
  ["ootsuki", RECEIPT_SORTER_DEV_ORG_ID].map((id) => id.toLowerCase()),
);

/** おおつき仕入DBに含める organization_id か（未設定は許可） */
export function isIncludedPurchaseOrganization(organizationId: string | undefined): boolean {
  if (!organizationId?.trim()) {
    return true;
  }
  return ALLOWED_ORGANIZATION_IDS.has(organizationId.trim().toLowerCase());
}