// apps/web/src/app/personas/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { defaultPersonaArchetypes, getPersonaProfile } from "@/lib/personaCatalog";
import { getPersonaColorClasses, PersonaGameBadges } from "@/components/PersonaGameBadges";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

type Item = {
  key: string;
  title: string;
  blurb: string | null;
  image_url?: string | null;
  theme?: string | null;
  category?: string | null;
};

function anchorId(label: string) {
  return (label || "General").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function PersonasCatalogPage() {
  let items: Item[] = [];
  let hasError = false;
  let ownedPersonaKeys: Set<string> | null = null;

  if (isSupabaseConfigured()) {
    try {
      const supa = await supabaseServer();
      const { data, error } = await supa
        .from("persona_archetype_defs")
        .select("key,title,blurb,image_url,theme,category")
        .order("category", { ascending: true })
        .order("title", { ascending: true });

      items = (data?.length ? data : defaultPersonaArchetypes()) as Item[];
      hasError = Boolean(error);

      const {
        data: { user },
      } = await supa.auth.getUser();
      if (user) {
        const ownedRes = await supa
          .from("user_personas")
          .select("persona_key")
          .eq("user_id", user.id)
          .limit(100);
        if (!ownedRes.error) {
          ownedPersonaKeys = new Set(
            (ownedRes.data ?? [])
              .map((row: any) => String(row?.persona_key ?? "").trim())
              .filter(Boolean)
          );
        }
      }
    } catch {
      hasError = true;
      items = defaultPersonaArchetypes();
    }
  } else {
    items = defaultPersonaArchetypes();
  }

  const itemByKey = new Map(items.map((item) => [item.key, item]));
  items = (defaultPersonaArchetypes() as Item[]).map((baseItem) => {
    const item = itemByKey.get(baseItem.key) ?? baseItem;
    const profile = getPersonaProfile(baseItem.key);
    return {
      ...baseItem,
      ...item,
      title: profile.displayName,
      blurb: profile.shortSummary,
    };
  });
  const discoveredCount =
    ownedPersonaKeys === null
      ? null
      : items.filter((item) => ownedPersonaKeys.has(item.key)).length;

  // カテゴリごとにグルーピング（空は "General" 扱いに）
  const groups = new Map<string, Item[]>();
  for (const r of items) {
    const cat = (r.category ?? "General").trim() || "General";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  const categories = Array.from(groups.keys());

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Persona Catalog
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="mt-1 text-2xl font-bold">恐竜図鑑</h1>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              全{items.length}体
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            投稿の成長シグナルから育つ恐竜キャラの一覧です。あなたの傾向や、相性の良いタイプを探せます。
          </p>
          {discoveredCount !== null && (
            <p className="mt-2 text-xs text-slate-500">
              発見済み {discoveredCount}体。未発見の恐竜は、投稿傾向が育つと姿を現します。
            </p>
          )}
        </div>
        {hasError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            キャラ一覧を読み込めませんでした。時間をおいて再度お試しください。
          </div>
        )}
        {items.length > 0 && (
          <nav className="flex flex-wrap gap-2 text-sm">
            {categories.map((c) => (
              <a
                key={c}
                href={`#${anchorId(c)}`}
                className="px-3 py-1 rounded-full border bg-white hover:bg-gray-50"
              >
                {c}
              </a>
            ))}
          </nav>
        )}
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">恐竜図鑑は準備中です</div>
          <p className="mt-1">
            データ接続後は、投稿から見えたキャラや相性の良いタイプをここで探せます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/compose" className="rounded-full bg-blue-600 px-4 py-2 text-white">
              投稿する
            </Link>
            <Link href="/persona-lab" className="rounded-full border border-slate-200 bg-white px-4 py-2">
              相性ラボへ
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {categories.map((cat) => {
            const list = groups.get(cat)!;
            return (
              <section key={cat} id={anchorId(cat)} className="scroll-mt-20">
                <h2 className="text-lg font-semibold mb-3 sticky top-14 bg-white/80 backdrop-blur py-2">
                  {cat}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {list.map((r) => {
                    const profile = getPersonaProfile(r.key);
                    const color = getPersonaColorClasses(r.key);
                    const isLocked = ownedPersonaKeys !== null && !ownedPersonaKeys.has(r.key);
                    const src = `/api/personas/image/${encodeURIComponent(r.key)}?title=${encodeURIComponent(
                      profile.displayName
                    )}`;
                    return (
                      <Link
                        key={r.key}
                        href={`/personas/${encodeURIComponent(r.key)}`}
                        className={`group block overflow-hidden rounded-2xl border bg-gradient-to-br ${color.card} transition hover:-translate-y-0.5 hover:shadow-lg ${
                          isLocked ? "border-dashed border-slate-300" : "border-slate-200"
                        }`}
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-white/70">
                          {isLocked ? (
                            <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500">
                              <span className="text-6xl grayscale opacity-35" aria-hidden="true">{profile.silhouetteEmoji}</span>
                              <span className="mt-3 rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-semibold">未発見</span>
                              <span className="mt-2 text-xs">まだ成長シグナルが足りません</span>
                            </div>
                          ) : (
                            <>
                              <img
                                src={src}
                                alt={profile.displayName}
                                loading="lazy"
                                className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                              />
                              <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/85 px-2 py-1 text-sm shadow-sm" aria-hidden="true">
                                {profile.iconEmoji}
                              </span>
                              <span className={`absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold shadow-sm ${color.accent}`}>
                                {profile.badgeLabel}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="text-base font-semibold group-hover:underline">
                            {profile.displayName}
                          </div>
                          <div className="text-xs font-medium text-blue-700">{profile.title}</div>
                          <PersonaGameBadges personaKey={r.key} className="mt-2" />
                          <p className="text-sm opacity-80 mt-1 line-clamp-3">
                            {profile.shortSummary}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {profile.traits.slice(0, 3).map((trait) => (
                              <span key={trait} className="rounded-full border bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                                {trait}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 rounded-xl border border-white/80 bg-white/70 p-2">
                            <div className="text-[11px] font-semibold text-slate-700">育ちやすい投稿</div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                              {profile.growthSignals.slice(0, 3).join("・")}
                            </p>
                          </div>
                          <div className={`mt-3 text-xs font-semibold ${color.accent}`}>
                            {isLocked ? "特徴を先に見る →" : "詳しく見る →"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
