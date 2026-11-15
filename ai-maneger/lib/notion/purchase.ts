import {
  getDatabaseSchemaProperties,
  getPropertyDate,
  getPropertyNameByAliases,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAll,
} from "@/lib/notion/client";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";
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

export async function getPurchaseEntries(): Promise<PurchaseEntry[]> {
  const cfg = await getActiveTenantNotionConfig();
  const purchaseDbId = cfg?.purchaseDbId || process.env.NOTION_PURCHASE_DB_ID;

  if (!purchaseDbId) {
    return [];
  }

  const schema = await getDatabaseSchemaProperties(purchaseDbId);
  const pages = await queryDatabaseAll(purchaseDbId);

  const entries: PurchaseEntry[] = [];

  for (const page of pages) {
    const dateKey = getPropertyNameByAliases(schema, DATE_KEYS);
    const supplierKey = getPropertyNameByAliases(schema, SUPPLIER_KEYS);
    const amountKey = getPropertyNameByAliases(schema, AMOUNT_KEYS);
    const taxCategoryKey = getPropertyNameByAliases(schema, TAX_CATEGORY_KEYS);
    const accountCategoryKey = getPropertyNameByAliases(schema, ACCOUNT_CATEGORY_KEYS);
    const itemNameKey = getPropertyNameByAliases(schema, ITEM_NAME_KEYS);
    const imageUrlKey = getPropertyNameByAliases(schema, IMAGE_URL_KEYS);
    const receiptIdKey = getPropertyNameByAliases(schema, RECEIPT_ID_KEYS);
    const organizationIdKey = getPropertyNameByAliases(schema, ORGANIZATION_ID_KEYS);

    const date = dateKey ? getPropertyDate(page.properties, DATE_KEYS) : "";
    const supplier = supplierKey ? getPropertyText(page.properties, SUPPLIER_KEYS) : "";
    const amountInclTax = amountKey ? getPropertyNumber(page.properties, AMOUNT_KEYS) : 0;
    const taxCategory = taxCategoryKey ? getPropertyText(page.properties, TAX_CATEGORY_KEYS) : "";
    const accountCategory = accountCategoryKey ? getPropertyText(page.properties, ACCOUNT_CATEGORY_KEYS) : "";
    const itemName = itemNameKey ? getPropertyText(page.properties, ITEM_NAME_KEYS) : "";
    const imageUrl = imageUrlKey ? getPropertyText(page.properties, IMAGE_URL_KEYS) : "";
    const receiptId = receiptIdKey ? getPropertyText(page.properties, RECEIPT_ID_KEYS) : "";
    const organizationId = organizationIdKey ? getPropertyText(page.properties, ORGANIZATION_ID_KEYS) : "";

    if (!date || typeof amountInclTax !== "number") {
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
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
