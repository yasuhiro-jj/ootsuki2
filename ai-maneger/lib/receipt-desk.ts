/** Receipt Desk（receipt-sorter フロント）のトップ URL */
export function getReceiptDeskUrl(): string {
  return (
    process.env.NEXT_PUBLIC_RECEIPT_DESK_URL ||
    process.env.NEXT_PUBLIC_RECEIPT_SORTER_URL ||
    "http://127.0.0.1:3000"
  ).trim();
}