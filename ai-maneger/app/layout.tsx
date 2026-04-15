import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Maneger",
  description: "Notion のプロジェクトDBを中核にした管理アプリMVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
