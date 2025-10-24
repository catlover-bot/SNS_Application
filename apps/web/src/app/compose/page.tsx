"use client";

import { useState } from "react";
import { computeLieScore } from "@sns/core";
import { supabase } from "@/lib/supabase";

type AnalysisFlags = {
  noExif?: boolean;
  possibleAIGenerated?: boolean;
  heavyEditing?: boolean;
};
type Analysis = {
  elaScore?: number;
  flags?: AnalysisFlags;
  reasons?: string[];
};

const LIMIT = 280;

export default function Compose() {
  const [text, setText] = useState("");
  const [score, setScore] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [posting, setPosting] = useState(false);

  function onChangeText(v: string) {
    const s = v.slice(0, LIMIT);
    setText(s);
    setScore(Math.round(computeLieScore({ text: s }) * 100) / 100);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setAnalysis(null);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (!f) return;

    // 画像解析 API
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/analyze-image", { method: "POST", body: fd });
      const json = await res.json();
      if (json?.ok) setAnalysis(json.result as Analysis);
    } catch {
      // 解析失敗は致命的でないので黙って続行
    }
  }

  async function submit() {
    if (posting) return;
    setPosting(true);

    try {
      // 認証確認
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("ログインが必要です");
        setPosting(false);
        return;
      }

      // 画像があれば Storage にアップロード
      let mediaUrl: string | undefined;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("media").upload(path, file, { upsert: false });
        if (up.error) {
          alert("画像のアップロードに失敗: " + up.error.message);
          setPosting(false);
          return;
        }
        const pub = supabase.storage.from("media").getPublicUrl(path);
        mediaUrl = pub.data.publicUrl;
      }

      // ★ author を入れるのが超重要！
      const { data, error } = await supabase
        .from("posts")
        .insert({
          author: user.id,              // ← これが無いと RLS で弾かれる構成が多い
          text,
          score,                        // double precision (0~1想定)
          media_urls: mediaUrl ? [mediaUrl] : [],   // 画像なしなら空配列でもOK
          analysis,                     // JSONB
        })
        .select("id")
        .single();

      if (error) {
        alert(error.message);
      } else {
        // 投稿成功
        setText(""); setFile(null); setPreview(null); setAnalysis(null);
        // 詳細に飛ぶ場合は /p/${data.id} へ
        location.href = "/";
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        className="w-full h-52 p-3 rounded border"
        placeholder="いま何してる？"
        value={text}
        onChange={(e) => onChangeText(e.target.value)}
      />
      <div className="flex items-center justify-between opacity-70 text-sm">
        <div>残り {LIMIT - text.length} 文字</div>
        <div>嘘っぽさ {(score * 100).toFixed(1)}%</div>
      </div>

      {/* 画像選択 */}
      <div className="space-y-2">
        <input type="file" accept="image/*" onChange={onPick} />
        {preview && (
          <div className="flex items-start gap-3">
            <img src={preview} className="w-40 h-40 object-cover rounded border" alt="" />
            {analysis ? (
              <div className="text-sm space-y-1">
                <div>
                  画像診断:
                  <span className={`ml-2 px-2 py-0.5 rounded ${analysis.flags?.heavyEditing ? "bg-red-100" : "bg-green-100"}`}>
                    加工{analysis.flags?.heavyEditing ? "強め" : "弱め/不明"}
                  </span>
                  <span className={`ml-2 px-2 py-0.5 rounded ${analysis.flags?.possibleAIGenerated ? "bg-orange-100" : "bg-gray-100"}`}>
                    AI生成{analysis.flags?.possibleAIGenerated ? "の可能性" : "手がかりなし"}
                  </span>
                </div>
                <div className="opacity-70">
                  ELA: {analysis.elaScore != null ? (analysis.elaScore * 100).toFixed(1) : "-"}% ／ EXIF: {analysis.flags?.noExif ? "なし" : "あり"}
                </div>
                {analysis.reasons?.length ? (
                  <ul className="list-disc pl-5 opacity-70">
                    {analysis.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : file ? <div className="opacity-70 text-sm">解析中...</div> : null}
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={posting || (!text && !file)}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        投稿してスコア化
      </button>
    </div>
  );
}
