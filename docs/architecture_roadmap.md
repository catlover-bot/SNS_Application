# PersonaLens Architecture Roadmap

最終更新: 2026-02-25

## 目的

- Web / Mobile の挙動差を最小化する
- キャラ要素（図鑑 / 相性 / 対話AI / キャラ別TL）を中核価値として強化する
- TL最適化 / 嘘スコア補正を「説明可能な学習機能」として運用可能にする
- App Store 提出後も安全に継続改善できる基盤を作る

## 基本方針

- 状態遷移は shared reducer + action に統一
- データ取得だけを platform 差分（Web=HTTP, Mobile=Supabase）
- ランキング/補正ロジックは `@sns/core` に集約
- UIコピー/説明文もできるだけ `@sns/core` helper で共通化

## 実装優先順

### 0. 直近スプリント（2026-02 後半）

優先度順:

- `notifications / saved / personaFeed` のロード関数内部を reducer action へ全面寄せ
- `学習/おすすめ` を TL だけでなくプロフィールでも Web/Mobile 同構成に統一
- 嘘スコア補正の文脈を拡張（添付詳細 / 曜日×時間帯×キャラ）
- 嘘スコア文脈学習係数の履歴（append-only）を保存し、推移を Web/Mobile で可視化
- キャラ詳細を「図鑑 -> 相性 -> 対話AI -> 投稿例」導線で強化

完了条件（DoD）:

- Web/Mobile の状態遷移ログが同じ action 名で追跡できる
- 学習/おすすめ 指標カードの見出し/説明/指標順が一致
- 嘘スコア詳細に文脈説明（時間帯/曜日/形式/キャラ/添付）が表示される
- 嘘スコア学習係数の推移が Web/Mobile の少なくとも1画面で確認できる
- キャラ詳細で相性/対話AI/投稿例に1タップで移動できる

### 1. State統一（本丸）

対象:

- `useSocialFeedState`
- `useNotificationsState`
- `useSavedState`
- `usePersonaFeedState`

目標:

- Web/Mobileで「取得手段だけ差分、状態遷移は同一」
- `dispatch(start/append/replace/fail/patch/reset)` を標準化
- 互換ラッパー（`setSavedFeed` など）を段階削除

進捗:

- reducer/action 基盤は導入済み
- Mobile の `notifications/saved/personaFeed` 更新系処理は reducer action 直化済み
- 次段は append/refresh/error 分岐の完全統一と wrapper 定義削除

### 2. ランキング基盤（TL + personaFeed）

TL:

- `timeline signal weights` を短期 / 長期の二層学習へ分離
- 保存・フォロー・開封・興味キャラの重み変動を安定化
- history を使って急変を抑える

personaFeed:

- `weights + history + learning` を TL と同じ設計で共通化
- 人気 + 個人最適 + キャラ適合の一貫ランキング

設計方針:

- `@sns/core/timelineRanking` に学習更新式
- `@sns/core/timelineLearningUi` にユーザー向け説明/可視化 helper
- DB は current state + history を分離

### 3. 嘘スコア精度強化（説明可能な補正）

現状:

- 時間帯
- 曜日
- 投稿形式（normal/short/story）
- キャラ（persona tone）
- 添付種別（none/image/video/url/mixed）
- 投稿長バケット
- 反応補正（返信/通報/真偽投票）
- 時系列減衰

次段（設計）:

- 添付種別の詳細比率（画像/動画/URLの混在比）を context に入れる
- `曜日×時間帯×キャラ` の学習係数（heuristic -> learned coefficient）へ移行

推奨DB設計（案）:

- `lie_score_context_coefficients`
  - `context_key` (例: `weekday_evening|expressive|video`)
  - `reply_baseline_adj`
  - `report_baseline_adj`
  - `confidence`
  - `samples`
  - `updated_at`
- `lie_score_context_feedback_history`（集約前の履歴, retention対象）

学習更新の方針:

- online update (EMA)
- low-sample時は heuristic 優先
- confidence に応じて blend
- 古い履歴は日次集約 + retention

### 4. キャラ要素強化（差別化の核）

必須:

- キャラ図鑑（全キャラ + 画像 + カテゴリ）
- キャラ詳細（性格プロファイル + 相性 + 対話AI + 投稿例）
- キャラ運用ガイド（おすすめフォーマット/時間帯/相性の使い方）
- キャラ別TL（同キャラ/相性/学習）

次段:

- キャラ詳細に「相性相手ごとの投稿戦略」表示
- キャラ別の TL 学習係数推移チャート
- キャラ進化グラフと投稿形式の相関表示

### 5. データ/運用設計

課題:

- learning/history テーブル肥大化
- dashboard クエリ負荷
- push queue/receipts の監視運用

対応方針:

- retention + aggregation job（cron/worker）
- 嘘スコア文脈学習係数の raw 履歴は `user_lie_score_context_coefficient_history`、日次圧縮は `..._daily` へ集約
- 圧縮関数 `compress_user_lie_score_context_coefficient_history_daily()` を cron で定期実行（例: raw 7日保持）
- 実行導線は internal worker API `POST /api/internal/lie-score-history-retention`（secret header 必須）を使用
- dashboard を「運用用」と「ユーザー向け」に分離
- user-facing は軽量要約、ops は集約テーブル参照

運用メモ（例）:

- header: `x-learning-maintenance-secret: $LIE_SCORE_RETENTION_SECRET`
- body 例: `{ "source": "cron", "beforeDays": 7, "autoReenter": true, "maxPasses": 4 }`
- 1日1回〜数回で十分（重い期間は `autoReenter` でまとめて圧縮）

### 6. セキュリティ/信頼性

優先項目:

- `auth_audit_events`
- rate limit / bot対策
- moderation queue
- 通報運用フローの管理画面

目標:

- App Store 提出後の運用事故を減らす
- abuse/spam に対して段階的に強化できる構造

## 画面設計ポリシー（Web/Mobile統一）

- 画面名・文言は共通（例: `学習/おすすめ`）
- 指標の説明・グラフの意味は同じ helper から生成
- 表示レイヤー差分は許容（Web card / Mobile modal）
- 一覧描画は platform 最適化（Web list / FlashList or ScrollView fallback）

## シミュレーター確認運用（この環境）

注意:

- Booted device が複数ある場合、`booted` 指定は誤端末を撮る

運用ルール:

- 必ず UDID を明示指定して撮影する
- 現在の確認対象: `iPhone 17 Pro (8D714328-9145-4B4B-89EC-BC4F8217E0A6)`

例:

```bash
xcrun simctl io 8D714328-9145-4B4B-89EC-BC4F8217E0A6 screenshot /tmp/personalens-check.png
```

制約:

- このCLIからはタップ/文字入力は不可
- 画面遷移確認は「ユーザー操作 + 単発スクショ + Metroログ」で行う

スクショ確認チェックリスト（直近）:

- `TL`（人気の投稿 / あなた向け / 学習/おすすめカード）
- `TL -> 学習/おすすめ` モーダル
- `投稿詳細 -> 嘘スコア詳細`（文脈表示を確認）
- `キャラ図鑑 -> キャラ詳細`（画像 / 運用ガイド / 相性導線）
