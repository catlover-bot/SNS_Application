export type PersonaCatalogEntry = {
  key: string;
  title: string;
  theme: "social" | "chaos" | "logic";
  vibe_tags: string[];
  talk_style: string;
  blurb: string;
  icon: string;
  relation_style: string;
  category: string;
};

// Fresh projects can render the character experience before optional DB catalog data is loaded.
// Keys intentionally match the persona image assets already shipped with the Web app.
export const DEFAULT_PERSONA_CATALOG: readonly PersonaCatalogEntry[] = [
  {
    key: "afterparty_host",
    title: "アフターパーティーの主催者",
    theme: "social",
    vibe_tags: ["社交", "会話", "盛り上げ"],
    talk_style: "相手を巻き込むテンポの良い話し方",
    blurb: "人と人の間に自然なきっかけを作る、場のムードメーカー。",
    icon: "/persona-images/afterparty_host.png",
    relation_style: "みんなが話しやすい温度に整える",
    category: "Social",
  },
  {
    key: "anchor_friend",
    title: "安心のアンカーフレンド",
    theme: "social",
    vibe_tags: ["安心", "傾聴", "信頼"],
    talk_style: "相手の言葉を受け止めてから穏やかに返す",
    blurb: "ゆっくり話せる安心感で、周りの人を支える存在。",
    icon: "/persona-images/anchor_friend.png",
    relation_style: "感情を受け止め、安心できる足場を作る",
    category: "Social",
  },
  {
    key: "peace_maker",
    title: "ピースメーカー",
    theme: "social",
    vibe_tags: ["調整", "共感", "協力"],
    talk_style: "意見の違いをほぐしながら共通点を探す",
    blurb: "対立の中にも共通点を見つけ、会話を前に進める調整役。",
    icon: "/persona-images/peace_maker.png",
    relation_style: "両方の立場を言葉にして橋をかける",
    category: "Social",
  },
  {
    key: "mood_chef",
    title: "ムードの料理人",
    theme: "social",
    vibe_tags: ["空気", "気遣い", "温度感"],
    talk_style: "場の空気を見て言葉の濃さを調整する",
    blurb: "その場にぴったりの言葉と温度を選ぶ、空気の料理人。",
    icon: "/persona-images/mood_chef.png",
    relation_style: "相手の気分に合わせて距離感を調整する",
    category: "Social",
  },
  {
    key: "chaos_comic",
    title: "カオスコミック",
    theme: "chaos",
    vibe_tags: ["笑い", "勢い", "ボケ"],
    talk_style: "予想外の一言と軽いユーモアで展開する",
    blurb: "日常のズレを笑いに変え、タイムラインに勢いを生むトリックスター。",
    icon: "/persona-images/chaos_comic.png",
    relation_style: "重くなりすぎないよう笑いで流れを変える",
    category: "Creative",
  },
  {
    key: "spark_maker",
    title: "ひらめきの着火役",
    theme: "chaos",
    vibe_tags: ["発想", "好奇心", "スピード"],
    talk_style: "思いついたアイデアを短くテンポ良く投げる",
    blurb: "小さな違和感から新しいアイデアを着火させる発想家。",
    icon: "/persona-images/spark_maker.png",
    relation_style: "最初の一歩を軽くして相手の発想を引き出す",
    category: "Creative",
  },
  {
    key: "why_comic",
    title: "なぜなぜコミック",
    theme: "chaos",
    vibe_tags: ["質問", "ユーモア", "探究"],
    talk_style: "「なんで？」を楽しい角度から投げかける",
    blurb: "素朴な疑問を笑いと探究に変える、好奇心のエンターテイナー。",
    icon: "/persona-images/why_comic.png",
    relation_style: "問いを共有して一緒に面白がる",
    category: "Creative",
  },
  {
    key: "fact_lover",
    title: "ファクトラバー",
    theme: "logic",
    vibe_tags: ["事実", "根拠", "比較"],
    talk_style: "根拠と結論を分けて端的に話す",
    blurb: "感覚だけで流されず、根拠と比較から納得できる道を作る人。",
    icon: "/persona-images/fact_lover.png",
    relation_style: "事実と意見を分け、判断材料を渡す",
    category: "Thinking",
  },
  {
    key: "moon_strategist",
    title: "月夜の戦略家",
    theme: "logic",
    vibe_tags: ["戦略", "観察", "計画"],
    talk_style: "状況を整理し、次の一手を静かに提案する",
    blurb: "落ち着いた観察から、無理のない次の一手を組み立てる戦略家。",
    icon: "/persona-images/moon_strategist.png",
    relation_style: "ゴールと役割を先に揃えて進める",
    category: "Thinking",
  },
  {
    key: "nocturnal_sage",
    title: "夜更けの賢者",
    theme: "logic",
    vibe_tags: ["深掘り", "静けさ", "内省"],
    talk_style: "急がず問いを深め、考えの輪郭を整える",
    blurb: "すぐに結論を出さず、問いを深めながら本質を見つける思索家。",
    icon: "/persona-images/nocturnal_sage.png",
    relation_style: "相手のペースを守りながら考えを深める",
    category: "Thinking",
  },
  {
    key: "truth_archer",
    title: "真実の弓使い",
    theme: "logic",
    vibe_tags: ["本質", "直球", "誠実"],
    talk_style: "論点を絞って、真っすぐに結論を届ける",
    blurb: "余分なノイズを外し、大切な論点を真っすぐ射抜くストレートプレイヤー。",
    icon: "/persona-images/truth_archer.png",
    relation_style: "誠実に論点を揃え、曖昧さを減らす",
    category: "Thinking",
  },
  {
    key: "garden_keeper",
    title: "言葉の庭師",
    theme: "social",
    vibe_tags: ["育成", "丁寧", "継続"],
    talk_style: "小さな変化を見つけて丁寧に言葉を返す",
    blurb: "派手さより継続を大切にし、人とアイデアをゆっくり育てる人。",
    icon: "/persona-images/garden_keeper.png",
    relation_style: "小さな前進を認めて継続を支える",
    category: "Support",
  },
];

export function findDefaultPersona(key: string | null | undefined) {
  const normalized = String(key ?? "").trim();
  return DEFAULT_PERSONA_CATALOG.find((entry) => entry.key === normalized) ?? null;
}

export function defaultPersonaArchetypes() {
  return DEFAULT_PERSONA_CATALOG.map((entry) => ({
    key: entry.key,
    title: entry.title,
    blurb: entry.blurb,
    image_url: entry.icon,
    theme: entry.theme,
    category: entry.category,
  }));
}

function pairHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function defaultPersonaCompat(sourceKey: string, kind: "friendship" | "romance", limit = 16) {
  const source = findDefaultPersona(sourceKey);
  if (!source) return [];

  return DEFAULT_PERSONA_CATALOG.filter((entry) => entry.key !== source.key)
    .map((entry) => {
      const sameTheme = source.theme === entry.theme;
      const noise = (pairHash(`${source.key}:${entry.key}:${kind}`) % 18) / 100;
      const score = Math.min(0.96, (sameTheme ? 0.7 : 0.58) + noise + (kind === "romance" ? 0.01 : 0));
      return {
        source_key: source.key,
        target_key: entry.key,
        kind,
        score,
        relation_label:
          kind === "romance"
            ? score >= 0.8
              ? "温度感が響き合うペア"
              : "違いを楽しめるペア"
            : score >= 0.8
            ? "テンポが合う相棒コンビ"
            : "得意分野を補い合えるコンビ",
        mode: "static_fallback",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Math.floor(limit))));
}
