import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-2xl font-bold">サポート</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          不具合報告、アカウント相談、キャラ分析に関する問い合わせはこちらから送れます。
        </p>
      </header>
      <div className="rounded-xl border bg-white p-4 text-sm">
        お問い合わせ: <a className="underline" href="mailto:support@persona-lens.app">support@persona-lens.app</a>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/legal/terms" className="underline">
          利用規約
        </Link>
        <Link href="/legal/privacy" className="underline">
          プライバシー
        </Link>
        <Link href="/legal/guidelines" className="underline">
          ガイドライン
        </Link>
      </div>
    </div>
  );
}
