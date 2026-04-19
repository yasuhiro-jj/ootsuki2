import type { Metadata } from "next";
import { EnvBadge } from "@/components/EnvBadge";
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
      <body className="antialiased">
        <div className="fixed right-3 top-3 z-50">
          <EnvBadge />
        </div>
        {children}
      </body>
    </html>
  );
}
