import {
  getDatabaseSchemaProperties,
  getPropertyDate,
  getPropertyNameByAliases,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAll,
} from "@/lib/notion/client";
import { isIncludedPurchaseOrganization } from "@/lib/notion/purchase-org";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";
import type { NotionProperty } from "@/types/notion";
import type { PurchaseEntry } from "@/types/ootsuki";

const DATE_KEYS = ["日付", "Date", "発行日"];
const SUPPLIER_KEYS = ["取引先", "Supplier", "仕入先"];
const AMOUNT_KEYS = ["金額(税込)", "金額", "Amount"];
const TAX_CATEGORY_KEYS = ["税区分", "Tax Category"];
const ACCOUNT_CATEGORY_KEYS = ["勘定科目", "Account Category", "科目"];
const ITEM_NAME_KEYS = ["品目", "Item", "品名"];
const IMAGE_URL_KEYS = ["画像URL", "Image URL"];
const RECEIPT_ID_KEYS = ["receipt_id", "Receipt ID"];
const ORGANIZATION_ID_KEYS = ["organization_id", "Organization ID"];
const STATUS_KEYS = ["ステータス", "Status"];

function getPropertyValue(
  properties: Record<string, NotionProperty>,
  schema: Record<string, NotionProperty>,
  aliases: string[],
): string {
  const key = getPropertyNameByAliases(schema, aliases);
  if (!key) return "";

  const prop = properties[key];
  if (!prop) return "";

  if (prop.select?.name) return prop.select.name;
  if (prop.rich_text?.length) {
    return prop.rich_text.map((t) => t.plain_text || "").join("");
  }

  return getPropertyText(properties, aliases);
}

function resolvePurchaseDbId(cfg: { purchaseDbId?: string } | null | undefined): string {
  return (
    cfg?.purchaseDbId ||
    process.env.NOTION_OOTSUKI_PURCHASE_DB_ID ||
    process.env.NOTION_PURCHASE_DB_ID ||
    ""
  ).trim();
}

export async function getPurchaseEntries(): Promise<PurchaseEntry[]> {
  const cfg = await getActiveTenantNotionConfig();
  const purchaseDbId = resolvePurchaseDbId(cfg);

  if (!purchaseDbId) {
    return [];
  }

  const schema = await getDatabaseSchemaProperties(purchaseDbId);
  const pages = await queryDatabaseAll(purchaseDbId);

  const entries: PurchaseEntry[] = [];

  for (const page of pages) {
    const date = getPropertyDate(page.properties, DATE_KEYS);
    const supplier = getPropertyValue(page.properties, schema, SUPPLIER_KEYS);
    const amountInclTax = getPropertyNumber(page.properties, AMOUNT_KEYS);
    const taxCategory = getPropertyValue(page.properties, schema, TAX_CATEGORY_KEYS);
    const accountCategory = getPropertyValue(page.properties, schema, ACCOUNT_CATEGORY_KEYS);
    const itemName = getPropertyValue(page.properties, schema, ITEM_NAME_KEYS);
    const imageUrl = getPropertyText(page.properties, IMAGE_URL_KEYS);
    const receiptId = getPropertyValue(page.properties, schema, RECEIPT_ID_KEYS);
    const organizationId = getPropertyValue(page.properties, schema, ORGANIZATION_ID_KEYS);
    const status = getPropertyValue(page.properties, schema, STATUS_KEYS);

    if (!date || typeof amountInclTax !== "number") {
      continue;
    }

    if (status && status !== "確認済み") {
      continue;
    }

    if (!isIncludedPurchaseOrganization(organizationId)) {
      continue;
    }

    entries.push({
      id: page.id,
      date,
      supplier,
      amountInclTax,
      taxCategory,
      accountCategory,
      itemName,
      imageUrl: imageUrl || undefined,
      receiptId: receiptId || undefined,
      organizationId: organizationId || undefined,
      status: status || undefined,
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
