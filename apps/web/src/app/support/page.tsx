import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">サポート</h1>
      <p>不具合報告・お問い合わせ: support@persona-lens.app</p>
      <div className="space-x-3 text-sm">
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
