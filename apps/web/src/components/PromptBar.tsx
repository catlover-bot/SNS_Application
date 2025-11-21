"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function PromptBar() {
  const [p, setP] = useState<any | null>(null);
  useEffect(() => {
    fetch("/api/prompts", { cache: "no-store" })
      .then(r => r.json()).then(setP).catch(() => {});
  }, []);
  if (!p) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-2 my-3 rounded-lg border bg-amber-50">
      <span className="font-medium mr-2">今日のお題:</span>
      <span className="mr-3">{p.title}</span>
      <Link href={`/compose?prompt_id=${p.id}`} className="underline">参加する</Link>
    </div>
  );
}
