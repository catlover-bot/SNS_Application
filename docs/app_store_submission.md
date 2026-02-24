# App Store 提出チェックリスト

最終更新: 2026-02-21

## 1. 必須インフラ

- `docs/sql/persona_assignment.sql` を適用
- `docs/sql/persona_feed_learning.sql` を適用
- `docs/sql/post_open_state.sql` を適用（TL「新着/過去」の開封状態永続）
- `docs/sql/app_store_safety.sql` を適用
  - `user_blocks`
  - `user_reports`
  - `delete_my_account()`
- CLIで反映する場合（本リポジトリに migration 作成済み）
  - `supabase/migrations/20260221064046_app_store_safety.sql`
  - `supabase/migrations/20260221191000_post_open_state.sql`
  - `supabase/migrations/20260221192500_delete_account_open_state_patch.sql`
  - `SUPABASE_ACCESS_TOKEN` を設定
  - `pnpm dlx supabase link --project-ref caxjqykilugdyukgrjrx`
  - `pnpm dlx supabase db push --linked`

## 2. Web起動と法務ページ確認

- `pnpm dev:web`
- 以下のページを表示確認
  - `/legal/terms`
  - `/legal/privacy`
  - `/legal/guidelines`
  - `/support`

## 3. Mobile設定

- `apps/mobile/.env` に以下を設定
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_WEB_BASE_URL` (Web法務ページURL)
- `apps/mobile/app.json` の提出前確認
  - `expo.name` / `expo.slug`（開発名のままにしない）
  - `expo.ios.bundleIdentifier` / `expo.ios.buildNumber`
  - `expo.android.package` / `expo.android.versionCode`
- `apps/mobile/eas.json` を用意し、`production` profile でビルドできる状態にする

## 3.5 自動事前チェック

- ルートで実行: `pnpm preflight:appstore`
- モバイルのみ: `pnpm -C apps/mobile run preflight:store`

## 4. 重点機能の手動テスト

- 投稿カードから `通報` が記録される
- 投稿カードから `ブロック` するとTL/検索/通知/詳細から即時非表示
- プロフィール > ブロック一覧で解除できる
- プロフィール > アカウント削除で `delete_my_account` が動作する
- 詳細手順は `docs/mobile_smoke_test_release.md` を参照

## 5. ビルド

- `pnpm build`
- `pnpm dev:mobile` でiOS/Android実機確認
