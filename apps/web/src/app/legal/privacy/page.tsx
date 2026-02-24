export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
      <p className="text-sm text-gray-600">最終更新日: 2026-02-21</p>
      <section className="space-y-2">
        <h2 className="font-semibold">1. 取得する情報</h2>
        <p>メールアドレス、プロフィール情報、投稿内容、リアクション、通知データを取得します。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">2. 利用目的</h2>
        <p>アカウント認証、フィード最適化、キャラ分析、サービス品質向上、違反対応のために利用します。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">3. 第三者提供</h2>
        <p>法令に基づく場合を除き、本人同意なく個人情報を第三者提供しません。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">4. 保管期間と削除</h2>
        <p>アカウント削除時に、当社が保持する対象データは削除フローに従って消去されます。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">5. お問い合わせ</h2>
        <p>privacy@persona-lens.app までご連絡ください。</p>
      </section>
    </div>
  );
}
