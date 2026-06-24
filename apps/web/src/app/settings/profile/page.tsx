// apps/web/src/app/settings/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildTimelineLearningActionTips,
  buildTimelineLearningSectionSummary,
  buildTimelineWeightTrendDeltaSummary,
  buildTimelineWeightTrendRatios,
  formatTimelineWeightPointLabel,
  type TimelineSignalWeightsHistoryPoint,
} from "@sns/core";
import { supabaseClient as supabase } from "@/lib/supabase/client";

type SavedProfile = {
  display_name: string | null;
  handle: string | null;
  bio: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

export default function ProfileSettings() {
  const sb = useMemo(() => supabase(), []); // ← ここでインスタンス化

  const [uid, setUid] = useState<string | null>(null);
  const [handle, setHandle] = useState(""); // @ユーザー名（=handle）
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pushSummary, setPushSummary] = useState<{
    available: boolean;
    queuePending: number;
    deliveryRate: number;
    openRate: number;
    enabledDevices: number;
    totalDevices: number;
  } | null>(null);
  const [timelineLearning, setTimelineLearning] = useState<{
    available: boolean;
    weightsSamples: number;
    learningInput: { openedCount: number; savedCount: number; followedCount: number };
    weightsHistory: TimelineSignalWeightsHistoryPoint[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { location.href = "/login?next=/settings/profile"; return; }
      setUid(user.id);

      const profileRes = await fetch("/api/me/profile", { cache: "no-store" });
      const profileJson = await profileRes.json().catch(() => null);
      const prof = profileJson?.profile as SavedProfile | undefined;
      if (profileRes.ok && prof) {
        setHandle(prof.handle ?? "");
        setDisplayName(prof.display_name ?? "");
        setBio(prof.bio ?? "");
        setAvatar(prof.avatar_url ?? null);
      } else {
        setMsg("プロフィールを読み込めませんでした。時間をおいて再度お試しください。");
      }

      setPushSummary({
        available: false,
        queuePending: 0,
        deliveryRate: 0,
        openRate: 0,
        enabledDevices: 0,
        totalDevices: 0,
      });

      const tlRes = await fetch("/api/me/timeline-signals", { cache: "no-store" });
      const tlJson = await tlRes.json().catch(() => null);
      if (tlRes.ok && tlJson) {
        setTimelineLearning({
          available: !Boolean(tlJson.degraded?.timelineWeightsMissing),
          weightsSamples: Math.max(0, Math.floor(Number(tlJson.weightsSamples ?? 0) || 0)),
          learningInput: {
            openedCount: Math.max(0, Math.floor(Number(tlJson.learningInput?.openedCount ?? 0) || 0)),
            savedCount: Math.max(0, Math.floor(Number(tlJson.learningInput?.savedCount ?? 0) || 0)),
            followedCount: Math.max(0, Math.floor(Number(tlJson.learningInput?.followedCount ?? 0) || 0)),
          },
          weightsHistory: Array.isArray(tlJson.weightsHistory)
            ? (tlJson.weightsHistory as TimelineSignalWeightsHistoryPoint[])
            : [],
        });
      }
    })();
  }, [sb]);

  const profileCompleteness = useMemo(() => {
    const checks = [
      handle.trim().length >= 3,
      displayName.trim().length > 0,
      bio.trim().length >= 20,
      !!avatar,
    ];
    const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return { score, checks };
  }, [avatar, bio, displayName, handle]);

  const timelineLearningSummary = useMemo(
    () =>
      buildTimelineLearningSectionSummary({
        weightsSamples: timelineLearning?.weightsSamples ?? 0,
        learningInput: timelineLearning?.learningInput ?? null,
        historyCount: timelineLearning?.weightsHistory.length ?? 0,
        weightsAvailable: timelineLearning?.available ?? true,
      }),
    [timelineLearning]
  );
  const timelineLearningBars = useMemo(
    () =>
      buildTimelineWeightTrendRatios(timelineLearning?.weightsHistory ?? [], 16).map((v) =>
        Math.round(v * 100)
      ),
    [timelineLearning?.weightsHistory]
  );
  const timelineLearningDelta = useMemo(
    () => buildTimelineWeightTrendDeltaSummary(timelineLearning?.weightsHistory ?? [], 10),
    [timelineLearning?.weightsHistory]
  );
  const timelineLearningActionTips = useMemo(
    () =>
      buildTimelineLearningActionTips({
        weightsSamples: timelineLearning?.weightsSamples ?? 0,
        learningInput: timelineLearning?.learningInput ?? null,
        history: timelineLearning?.weightsHistory ?? [],
      }),
    [timelineLearning]
  );

  async function save() {
    if (saving) return;
    if (!uid) return;
    setSaving(true);
    setMsg(null);

    // 形式チェック（DB 側制約に合わせる）
    if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
      setMsg("ユーザー名は3〜20文字の英数字と _ のみです。");
      setSaving(false);
      return;
    }
    if (displayName.trim().length > 50) {
      setMsg("表示名は50文字以内で入力してください。");
      setSaving(false);
      return;
    }
    if (bio.trim().length > 300) {
      setMsg("自己紹介は300文字以内で入力してください。");
      setSaving(false);
      return;
    }

    try {
      let avatar_url = avatar;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${uid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("avatars").upload(path, file);
        if (error) {
          setMsg("アイコンのアップロードに失敗しました。画像を変えるか、時間をおいて再度お試しください。");
          return;
        }
        avatar_url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const saveRes = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          display_name: displayName || null,
          bio: bio || null,
          avatar_url,
        }),
      });
      const saveJson = await saveRes.json().catch(() => null);
      if (!saveRes.ok || !saveJson?.profile) {
        const code = String(saveJson?.error ?? "");
        setMsg(
          code === "handle_already_used"
            ? "そのユーザー名は既に使われています。"
            : code === "invalid_handle"
            ? "ユーザー名の形式が不正です。"
            : "プロフィールを保存できませんでした。時間をおいて再度お試しください。"
        );
        return;
      }

      const saved = saveJson.profile as SavedProfile;
      setHandle(saved.handle ?? "");
      setDisplayName(saved.display_name ?? "");
      setBio(saved.bio ?? "");
      setAvatar(saved.avatar_url ?? null);
      setFile(null);
      setMsg("Supabase に保存しました。");
    } catch {
      setMsg("プロフィールを保存できませんでした。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (deleting) return;
    const yes = window.confirm(
      "アカウントを完全削除します。投稿・プロフィール等のデータは復元できません。実行しますか？"
    );
    if (!yes) return;

    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me/delete-account", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "アカウント削除に失敗しました");
      }
      await sb.auth.signOut();
      location.href = "/";
    } catch {
      setMsg("アカウント削除に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-2xl font-bold">プロフィール編集</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          表示名、自己紹介、アイコンを整えると、投稿とキャラ分析が見つけてもらいやすくなります。
        </p>
      </header>

      <div className="flex items-center gap-3">
        <img
          src={avatar ?? "https://placehold.co/80x80"}
          className="w-16 h-16 rounded-full object-cover border"
          alt="avatar"
        />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <label className="block">
        <div className="text-sm opacity-60">@ユーザー名（英数と _ ・3〜20 文字）</div>
        <input
          className="w-full border rounded p-2"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="your_id"
        />
      </label>

      <label className="block">
        <div className="text-sm opacity-60">表示名</div>
        <input
          className="w-full border rounded p-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>

      <label className="block">
        <div className="text-sm opacity-60">自己紹介</div>
        <textarea
          className="w-full border rounded p-2 h-28"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        {saving ? "保存中…" : "プロフィールを保存"}
      </button>

      <div className="border rounded-lg p-4 space-y-3 bg-white">
        <div className="flex items-center justify-between">
          <div className="font-semibold">プロフィール完成度</div>
          <div className="text-sm opacity-80">{profileCompleteness.score}%</div>
        </div>
        <div className="h-2 rounded bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${Math.max(6, profileCompleteness.score)}%` }}
          />
        </div>
        <div className="grid gap-1 text-sm">
          <div className={profileCompleteness.checks[0] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[0] ? "✓" : "•"} ユーザー名
          </div>
          <div className={profileCompleteness.checks[1] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[1] ? "✓" : "•"} 表示名
          </div>
          <div className={profileCompleteness.checks[2] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[2] ? "✓" : "•"} 自己紹介（20文字以上）
          </div>
          <div className={profileCompleteness.checks[3] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[3] ? "✓" : "•"} アイコン画像
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2 bg-white">
        <div className="font-semibold">{timelineLearningSummary.title}</div>
        <div className="text-sm opacity-80">{timelineLearningSummary.stageDescription}</div>
        {timelineLearningActionTips.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
            <div className="text-xs font-semibold text-blue-900">おすすめを育てるコツ</div>
            {timelineLearningActionTips.map((tip) => (
              <div key={`profile-tl-tip-${tip.key}`} className="text-xs text-blue-800">
                ・{tip.label}: {tip.detail}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          {timelineLearningSummary.metrics.map((m) => (
            <span key={m.key} className="inline-flex items-center rounded-full border bg-slate-50 px-2 py-0.5">
              {m.label} {m.value}
            </span>
          ))}
          <span className="inline-flex items-center rounded-full border bg-blue-50 text-blue-700 px-2 py-0.5">
            {timelineLearningSummary.stageLabel}
          </span>
        </div>
        {!timelineLearning?.available ? (
          <div className="text-sm text-amber-700">{timelineLearningSummary.unavailableHint}</div>
        ) : timelineLearningBars.length > 1 ? (
          <div className="rounded-lg border bg-slate-50 px-2 py-2">
            <div className="flex h-10 items-end gap-1">
              {timelineLearningBars.map((h, idx) => (
                <div
                  key={`profile-tl-learning-bar-${idx}`}
                  className="flex-1 rounded-sm bg-gradient-to-t from-blue-500 to-cyan-300"
                  style={{ height: `${Math.max(8, h)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">{timelineLearningSummary.chartCaption}</div>
            {timelineLearningDelta ? (
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span>
                  保存 {formatTimelineWeightPointLabel(timelineLearningDelta.saved, { signed: true, suffix: "pt" })}
                </span>
                <span>
                  フォロー{" "}
                  {formatTimelineWeightPointLabel(timelineLearningDelta.followed, {
                    signed: true,
                    suffix: "pt",
                  })}
                </span>
                <span>
                  開封抑制{" "}
                  {formatTimelineWeightPointLabel(timelineLearningDelta.openedPenalty, {
                    signed: true,
                    suffix: "pt",
                  })}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm opacity-70">{timelineLearningSummary.historyEmptyHint}</div>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/home" className="underline">
            ホームTLを見る
          </a>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2 bg-white">
        <div className="font-semibold">反応の振り返り</div>
        {!pushSummary ? (
          <div className="text-sm opacity-70">反応サマリーを読み込み中…</div>
        ) : !pushSummary.available ? (
          <div className="text-sm text-amber-700">
            反応サマリーは準備中です。投稿と通知の利用が増えると、ここに傾向が表示されます。
          </div>
        ) : (
          <div className="grid gap-1 text-sm">
            <div>
              通知の到達 {Math.round(pushSummary.deliveryRate * 100)}% / 開封 {Math.round(pushSummary.openRate * 100)}%
            </div>
            <div>
              通知を受け取れる端末 {pushSummary.enabledDevices}/{pushSummary.totalDevices}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/persona-feed" className="underline">
            キャラTL
          </a>
          <a href="/saved" className="underline">
            保存コレクション
          </a>
          <a href="/persona-evolution" className="underline">
            キャラ進化
          </a>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-semibold">法務とサポート</div>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/settings/security" className="underline">
            セキュリティ設定
          </a>
          <a href="/legal/terms" className="underline">
            利用規約
          </a>
          <a href="/legal/privacy" className="underline">
            プライバシー
          </a>
          <a href="/legal/guidelines" className="underline">
            ガイドライン
          </a>
          <a href="/support" className="underline">
            サポート
          </a>
        </div>
      </div>

      <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
        <div className="font-semibold text-red-800">アカウント管理</div>
        <p className="text-sm text-red-700">
          アカウントを削除すると、投稿・プロフィールなどのデータは復元できません。
        </p>
        <button
          onClick={deleteAccount}
          disabled={deleting}
          className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-50"
        >
          {deleting ? "削除中..." : "アカウントを削除"}
        </button>
      </div>

      {msg && <div className="text-sm opacity-80">{msg}</div>}
    </div>
  );
}
