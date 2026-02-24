# Mobile Final Smoke Test (Release)

最終更新: 2026-02-21

## 前提

- テスト用アカウントを2つ用意する（A/B）
- `docs/sql/persona_assignment.sql`
- `docs/sql/persona_feed_learning.sql`
- `docs/sql/post_open_state.sql`
- `docs/sql/app_store_safety.sql`
- 上記が適用済みであること

## 1. 通知 → 投稿詳細遷移

1. BがAの投稿に `like` か `reply` を行う
2. Aでモバイルアプリの通知タブを開く
3. 新着セクションに通知が出ることを確認
4. 通知カードの `投稿を開く` をタップ
5. 投稿詳細が開くことを確認

期待結果:

- 通知の `read_at` が更新される
- 通知が「新着」から「過去」へ移動する

## 2. TL 新着/過去の永続（再訪）

1. Aでタイムラインを開く
2. 新着の投稿を1件開いて詳細へ遷移
3. TLに戻る
4. 該当投稿が「過去」へ移ることを確認
5. アプリを完全終了して再起動
6. 再ログイン後にTLを開く

期待結果:

- 開封済み投稿は再起動後も「過去」に残る
- `public.user_post_open_state` に `user_id, post_id` が保存される

## 3. キャラ別TL 新着/過去 + 表示理由

1. キャラ別TLを開く
2. `なぜ表示?` を開いて理由が表示されることを確認
3. 投稿詳細を開く
4. キャラ別TLで該当投稿が「過去」へ移ることを確認

期待結果:

- 理由文（同キャラ/相性/学習）が表示される
- 開封状態がDBに保存され、再訪時も維持される

## 4. アカウント削除

1. Aでプロフィール画面からアカウント削除を実行
2. 削除完了後にログインできないことを確認
3. Supabaseで以下の関連データが削除されることを確認
   - `profiles`
   - `posts`
   - `notifications` (actor/user)
   - `persona_feed_events`
   - `persona_dwell_learning_state`
   - `persona_buzz_learning_state`
   - `user_post_open_state`

期待結果:

- `delete_my_account()` が成功し、個人データが残存しない

## 5. リリース判定

- クラッシュなし
- 各フローの期待結果が満たされる
- `pnpm preflight:appstore` が PASS
- `pnpm build` が PASS
