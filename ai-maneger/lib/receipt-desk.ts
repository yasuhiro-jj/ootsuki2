/** Receipt Desk（receipt-sorter フロント）のトップ URL */
export function getReceiptDeskUrl(): string {
  return (
    process.env.NEXT_PUBLIC_RECEIPT_DESK_URL ||
    process.env.NEXT_PUBLIC_RECEIPT_SORTER_URL ||
    "https://receipt-sorter-eskm.vercel.app"
  ).trim();
}