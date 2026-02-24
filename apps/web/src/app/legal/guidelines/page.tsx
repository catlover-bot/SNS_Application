export default function GuidelinesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">コミュニティガイドライン</h1>
      <p className="text-sm text-gray-600">最終更新日: 2026-02-21</p>
      <section className="space-y-2">
        <h2 className="font-semibold">1. 安全な会話を守る</h2>
        <p>差別、脅迫、執拗な嫌がらせ、個人情報の晒し行為は禁止です。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">2. コンテンツの透明性</h2>
        <p>誤情報を意図的に拡散する行為、なりすましアカウント運用を禁止します。</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">3. 通報と対応</h2>
        <p>ユーザーは投稿を通報・ユーザーをブロックできます。違反確認時は投稿削除や利用制限を実施します。</p>
      </section>
    </div>
  );
}
