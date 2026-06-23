"use client";

import Link from "next/link";

type Props = {
  compact?: boolean;
};

const steps = [
  {
    title: "1. 投稿する",
    body: "短い近況を書くだけ。投稿前に言葉のクセとキャラ成長への影響予測を確認できます。",
    href: "/compose",
    label: "投稿を作る",
  },
  {
    title: "2. AI判定を見る",
    body: "事実っぽさ・盛ってる度・自慢・マウント感・ネタ度を、理由とタグで楽しめます。",
    href: "/",
    label: "タイムラインへ",
  },
  {
    title: "3. マイ恐竜を見る",
    body: "投稿履歴と反応からキャラスコアが育ち、相性やキャラTLに反映されます。",
    href: "/dashboard/persona",
    label: "あなたの恐竜を確認",
  },
];

export default function SignedInDemoGuide({ compact = false }: Props) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Demo flow</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950">最初の3ステップで恐竜キャラSNSを体験する</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            投稿をAI判定で楽しみ、そのシグナルの積み重ねからあなた自身のキャラを育てます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/persona" className="rounded-full bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-800">
            あなたの恐竜を確認する
          </Link>
          <Link href="/search" className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-800">
            投稿を探す
          </Link>
        </div>
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
