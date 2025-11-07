"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Persona = {
  key: string;
  title: string;
  blurb: string | null;
  long_desc: string | null;
  image_url: string | null;
  theme: string | null;
  strengths: string[] | null;
  pitfalls: string[] | null;
  ideal_roles: string[] | null;
  growth_tips: string[] | null;
  sample_bio: string | null;
  w: number | null;
};

function normalizeKey(s: string) {
  return s.replace(/^@/, "").trim().toLowerCase().replace(/-/g, "_");
}

// 透明1px（最終手段）
const TRANSPARENT_PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAusB8vXkq2UAAAAASUVORK5CYII=";

export default function PersonaDetailPage() {
  const params = useParams<{ key?: string }>();
  const sp = useSearchParams();

  // 1) /personas/[key] → 2) ?key= → 3) pathname
  const raw = useMemo(() => {
    const p = typeof params?.key === "string" ? decodeURIComponent(params.key) : "";
    const q = sp?.get("key") ? decodeURIComponent(sp.get("key")!) : "";
    let path = "";
    if (typeof window !== "undefined") {
      const m = window.location.pathname.match(/\/personas\/([^\/?#]+)/i);
      path = m ? decodeURIComponent(m[1]) : "";
    }
    return p || q || path || "";
  }, [params, sp]);

  const key = useMemo(() => normalizeKey(raw), [raw]);

  const [persona, setPersona] = useState<Persona | null>(null);
  const [hot, setHot] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // フォールバック制御
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [tried, setTried] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!key) {
        setErr(`key が空です。（raw="${raw}" / normalized="${key}"）`);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
        // 詳細API
        const res = await fetch(`/api/personas/${encodeURIComponent(key)}`, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        const json = JSON.parse(text);
        if (!alive) return;

        const pr = json.persona as Persona;
        setPersona(pr);
        setHot(Array.isArray(json.hot) ? json.hot : []);

        // ★ 画像候補（ローカル最優先 → _missing → 最後に外部 → 1px）
        const candidates = [
          `/persona-images/${encodeURIComponent(pr.key)}.png`,
          `/persona-images/${encodeURIComponent(pr.key)}_legend.png`,
          `/persona-images/${encodeURIComponent(pr.key)}_lite.png`,
          "/persona-images/_missing.png",
          pr.image_url || "",  // ← 外部URLは最後に試す（問題の切り分けのため）
          TRANSPARENT_PNG_1PX,
        ].filter(Boolean);

        setTried(new Set());
        setImgSrc(candidates[0]);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "failed to load persona");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [key, raw]);

  const handleImgError = () => {
    if (!persona) return;
    const candidates = [
      `/persona-images/${encodeURIComponent(persona.key)}.png`,
      `/persona-images/${encodeURIComponent(persona.key)}_legend.png`,
      `/persona-images/${encodeURIComponent(persona.key)}_lite.png`,
      "/persona-images/_missing.png",
      persona.image_url || "",
      TRANSPARENT_PNG_1PX,
    ].filter(Boolean);

    const used = new Set(tried);
    const current = imgSrc ?? "";
    used.add(current);

    const next = candidates.find((c) => !used.has(c));
    setTried(used);
    if (next) setImgSrc(next);
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto p-6 opacity-70">読み込み中…</div>;
  }

  if (err || !persona) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-bold">@{key || "?"}</h1>
        <div className="rounded border bg-red-50 text-red-700 p-4 text-sm">
          キャラ詳細の読み込みに失敗しました：{err || "not found"}
        </div>
        <div className="text-xs opacity-70">
          <code>raw="{raw}" / normalized="{key}"</code>
        </div>
        <div className="mt-2">
          <Link href="/personas" className="underline">キャラ図鑑へ戻る</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-xl border bg-white overflow-hidden">
          <img
            src={imgSrc ?? ""}
            alt={persona.title}
            className="w-full h-full object-contain"
            onError={handleImgError}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{persona.title}</h1>
          <div className="text-sm opacity-70 truncate">@{persona.key}</div>
        </div>
        <div className="ml-auto">
          <Link href="/personas" className="underline">図鑑に戻る</Link>
        </div>
      </header>

      {persona.blurb && <p className="opacity-80">{persona.blurb}</p>}

      {persona.long_desc && (
        <section className="prose max-w-none whitespace-pre-wrap">{persona.long_desc}</section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {persona.strengths?.length ? (
          <div className="rounded border p-4 bg-white">
            <h2 className="font-semibold mb-2">Strengths</h2>
            <ul className="list-disc pl-5 space-y-1">{persona.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        ) : null}
        {persona.pitfalls?.length ? (
          <div className="rounded border p-4 bg-white">
            <h2 className="font-semibold mb-2">Pitfalls</h2>
            <ul className="list-disc pl-5 space-y-1">{persona.pitfalls.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        ) : null}
        {persona.ideal_roles?.length ? (
          <div className="rounded border p-4 bg-white">
            <h2 className="font-semibold mb-2">Ideal Roles</h2>
            <ul className="list-disc pl-5 space-y-1">{persona.ideal_roles.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        ) : null}
        {persona.growth_tips?.length ? (
          <div className="rounded border p-4 bg-white">
            <h2 className="font-semibold mb-2">Growth Tips</h2>
            <ul className="list-disc pl-5 space-y-1">{persona.growth_tips.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        ) : null}
      </section>

      {persona.sample_bio && (
        <section className="rounded border p-4 bg-white">
          <h2 className="font-semibold mb-2">Sample Bio</h2>
          <pre className="whitespace-pre-wrap break-words text-sm opacity-80">{persona.sample_bio}</pre>
        </section>
      )}

      <section className="rounded border p-4 bg-white">
        <h2 className="font-semibold mb-3">関連投稿</h2>
        {hot.length === 0 ? (
          <div className="text-sm opacity-70">まだ関連投稿はありません。</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {hot.map((p, i) => (
              <li key={i} className="border rounded p-2 bg-gray-50">
                <div className="opacity-60 text-xs">{new Date(p.created_at).toLocaleString()}</div>
                <div className="whitespace-pre-wrap">{p.text}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
