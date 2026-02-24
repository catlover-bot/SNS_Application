# SNS_Application

Supabase をバックエンドにした SNS アプリのモノレポです。  
`apps/web` は Next.js、`apps/mobile` は Expo (React Native) で実装しています。

## Workspace 構成

- `apps/web`: Web フロントエンド（Next.js App Router）
- `apps/mobile`: スマホアプリ（Expo / React Native）
- `packages/core`: 共通ロジック（例: `computeLieScore`）

## セットアップ

```bash
pnpm install
```

## 環境変数

### Web (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

任意（AI連携）:

```bash
LLM_API_BASE_URL=...
LLM_API_KEY=...
LLM_MODEL_NAME=gpt-4o-mini
```

### Mobile (`apps/mobile/.env`)

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
# 任意: Web API 経由で対話AIを使う場合
EXPO_PUBLIC_WEB_BASE_URL=http://localhost:3000
```

## 開発起動

```bash
pnpm dev:web
pnpm dev:mobile
```

またはモノレポ同時起動:

```bash
pnpm dev
```

## 現在の実装範囲

### Web

- タイムライン表示（`feed_latest` + フォールバック）
- 投稿作成（テキスト + 嘘っぽさスコア）
- キャラ別タイムライン `/persona-feed`（同キャラ / 相性キャラ優先）
- キャラ別TLフィードバック学習（閲覧/開封イベントで重み更新）
- dwell time（滞在秒）重みを `persona_key × dwell_bucket` 学習でオンライン最適化
- キャラ進化 `/persona-evolution`（投稿履歴からキャラ変遷グラフ）
- キャラインサイト `/api/me/persona-insights`（連続日数・直近モメンタム・内訳）
- キャラクエスト `/api/me/persona-quests`（主キャラ継続 / 逆視点 / 相棒返信）
- キャラ相性ラボ `/persona-lab`（相性比較・会話スターター・対話AI返信草案）
- キャラ画像カバレッジ API `/api/personas/image-coverage`（静的画像/フォールバック可視化）
- 相性API `/api/personas/compat` の理由拡張（次元スコア/強み/注意点/会話フック）
- 対話AI: 返信先投稿本文を入力して文脈付き草案生成
- キャラ性格プロファイル（口調/関係性/返信フック/注意点）を表示
- キャラ画像は `/api/personas/image/[key]` で静的 + 自動生成フォールバック
- 投稿作成: キャラ候補推定と投稿へのキャラヒント付与
- 投稿作成: デュアルキャラ（主/副）ブレンド草案生成
- 投稿詳細 `/p/[id]` と返信スレッド
- 通知一覧 `/notifications` と既読化
- モデレーションAPI（通報 / ブロック / アカウント削除RPC呼び出し）
- 法務ページ（`/legal/terms` `/legal/privacy` `/legal/guidelines`）と `/support`
- 検索 / トレンド / DM / フォロー中 / キャラ関連ページ
- ダッシュボード（キャラ再評価 + 自分の投稿一覧）

### Mobile

- メール/パスワード認証（ログイン・新規登録・ログアウト）
- タイムライン表示
- フォロー中フィード表示
- キャラ別TL（同キャラ/相性キャラ優先）+ 閲覧ログ学習
- dwell time 重みを `persona_key × dwell_bucket` 学習でオンライン最適化
- キャラ進化（投稿履歴ベースの主キャラ変遷）
- キャラインサイト（連続日数・7日モメンタム）
- キャラクエスト（投稿継続と差別化投稿をゲーム化）
- キャラ対話AI（相性ペア向け返信草案、返信先本文入力）
- メインキャラ性格プロファイル（口調/関係性/返信フック）表示
- 投稿作成（`computeLieScore` 連携）
- 投稿作成時のキャラ候補推定/選択（analysis に保存）
- 投稿作成: デュアルキャラ（主/副）ブレンド草案生成
- キャラ文体アシスト（メインキャラの話し方テンプレ）
- 今日のお題（`prompts_of_day`）を投稿入力へ反映
- 投稿検索（本文キーワード）
- 通知一覧（未読表示・既読化・通知種別UI）
- 投稿詳細モーダル（通知/TL/検索/フォロー中から遷移）
- キャラ分析（自分のキャラ分布・ソウルメイト候補・再評価）
- プロフィール表示/更新
- 投稿カードからの通報・ユーザーブロック
- ブロック一覧と解除
- 法務リンク導線（規約 / プライバシー / ガイドライン / サポート）
- アプリ内アカウント削除（`delete_my_account` RPC）

## よく使うコマンド

```bash
pnpm build
pnpm clean
pnpm preflight:appstore
pnpm -C apps/mobile run preflight:store
pnpm -C apps/mobile run build:ios:prod
pnpm -C apps/mobile run submit:ios:prod
pnpm persona:fill-images -- --base-url http://localhost:3000
# 既存画像も含めて新スタイルで再生成
pnpm persona:fill-images -- --base-url http://localhost:3000 --all --overwrite
```

## 補足 SQL

- `assign_top_persona` と `user_personas` の基盤は `docs/sql/persona_assignment.sql` を参照
- キャラ別TLのオンライン学習テーブルは `docs/sql/persona_feed_learning.sql` を参照
- App Store 提出向けの安全テーブルと削除RPCは `docs/sql/app_store_safety.sql` を参照
- 提出前手順は `docs/app_store_submission.md` を参照
