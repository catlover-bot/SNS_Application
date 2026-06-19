"use client";

import Link from "next/link";

type Props = {
  compact?: boolean;
};

const steps = [
  {
    title: "1. 投稿する",
    body: "短い投稿を書くだけで、キャラ候補、返信導線、リライト案を投稿前に確認できます。",
    href: "/compose",
    label: "投稿を作る",
  },
  {
    title: "2. キャラを見る",
    body: "投稿がキャラ、クエスト、相性候補にどうつながるかをダッシュボードで確認します。",
    href: "/dashboard/persona",
    label: "キャラ分析へ",
  },
  {
    title: "3. TLを育てる",
    body: "投稿を開く、保存する、フォローするほどホームとキャラTLがあなた向けになります。",
    href: "/persona-feed",
    label: "キャラTLへ",
  },
];

export default function SignedInDemoGuide({ compact = false }: Props) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Demo flow</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950">最初の5分でキャラSNSを体験する</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            投稿がキャラを育て、そのキャラがタイムライン、相性、返信のきっかけにつながります。
          </p>
        </div>
        <Link href="/search" className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-800">
          投稿を探す
        </Link>
      </div>
      {!compact && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {steps.map((step) => (
            <Link
              key={step.title}
              href={step.href}
              className="rounded-lg border border-blue-100 bg-white p-3 text-sm hover:border-blue-300"
            >
              <div className="font-semibold text-slate-900">{step.title}</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{step.body}</p>
              <div className="mt-2 text-xs font-medium text-blue-700">{step.label}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
