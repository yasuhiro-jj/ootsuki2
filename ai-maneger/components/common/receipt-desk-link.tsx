import { getReceiptDeskUrl } from "@/lib/receipt-desk";

type ReceiptDeskLinkProps = {
  variant?: "sidebar" | "header" | "footer";
  className?: string;
};

const variantClass: Record<NonNullable<ReceiptDeskLinkProps["variant"]>, string> = {
  sidebar:
    "block rounded-2xl border border-orange-400/40 bg-orange-500/15 px-4 py-3 text-center text-sm font-semibold text-orange-100 transition hover:bg-orange-500/30 hover:text-white",
  header:
    "inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-900 transition hover:bg-orange-100",
  footer: "font-semibold text-orange-700 hover:underline",
};

export function ReceiptDeskLink({ variant = "sidebar", className }: ReceiptDeskLinkProps) {
  const href = getReceiptDeskUrl();
  const merged = className ? `${variantClass[variant]} ${className}` : variantClass[variant];

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={merged}>
      Receipt Desk に戻る
    </a>
  );
}