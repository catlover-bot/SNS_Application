// apps/web/src/app/ClientGate.tsx
"use client";

export default function ClientGate({ children }: { children: React.ReactNode }) {
  // いまは何もせず、そのまま描画（フックも新規ファイルも不要）
  return <>{children}</>;
}
