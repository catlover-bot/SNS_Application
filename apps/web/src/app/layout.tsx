import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ClientGate from "./ClientGate";

export const metadata: Metadata = {
  title: "PersonaLens",
  description: "キャラ指紋でタイムラインを最適化するSNS",
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
