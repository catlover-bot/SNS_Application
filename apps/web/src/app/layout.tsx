import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "SNS × 嘘発見スコア",
  description: "投稿の嘘っぽさをスコア化する実験アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
