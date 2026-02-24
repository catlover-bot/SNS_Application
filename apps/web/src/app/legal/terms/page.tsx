export default function TermsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">利用規約</h1>
      <p className="text-sm text-gray-600">最終更新日: 2026-02-21</p>
      <section className="space-y-2">
        <h2 className="font-semibold">1. サービス概要</h2>
        <p>PersonaLens は、投稿・返信・フォロー・通知・キャラ分析機能を提供するSNSです。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">2. 禁止事項</h2>
        <p>違法行為、第三者への誹謗中傷、スパム、なりすまし、権利侵害行為を禁止します。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">3. アカウント管理</h2>
        <p>ユーザーはアプリ内プロフィール画面からアカウントを削除できます。削除後のデータ復元はできません。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">4. 免責</h2>
        <p>本サービスは現状有姿で提供され、継続性・完全性・特定目的適合性を保証しません。</p>
      </section>
    </div>
  );
}
