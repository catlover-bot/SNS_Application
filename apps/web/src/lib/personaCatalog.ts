export type PersonaRarity = "common" | "rare" | "epic" | "legendary";

export type PersonaProfile = {
  key: string;
  displayName: string;
  speciesName?: string;
  title: string;
  shortSummary: string;
  description: string;
  traits: string[];
  growthSignals: string[];
  aiScoreHints?: string[];
  evolutionHint: string;
  toneKeywords?: string[];
  rarity: PersonaRarity;
  element: string;
  evolutionStage: 1 | 2 | 3;
  evolutionStageName: string;
  badgeLabel: string;
  silhouetteEmoji: string;
  iconEmoji: string;
  colorHint: string;
};

export type PersonaCatalogEntry = PersonaProfile & {
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
    displayName: "ネオンラプトル",
    speciesName: "ネオンラプトル属",
    title: "場を明るく動かす盛り上げ型",
    shortSummary: "会話のきっかけを軽やかに作り、人を巻き込む社交派恐竜。",
    description: "誰かが入りやすい話題を投げ、タイムラインの温度を自然に上げます。近況共有や問いかけが積み重なるほど、明るい主催者らしさが育ちます。",
    traits: ["社交的", "会話の起点", "前向き", "テンポが良い"],
    growthSignals: ["仲間を巻き込む問いかけ", "イベントや近況の共有", "前向きなリアクション", "会話を広げる一言"],
    aiScoreHints: ["ネタ・ジョーク度や軽い盛ってる度が親しみやすさにつながります", "自慢・マウント感が強すぎない投稿と好相性です"],
    evolutionHint: "次は、みんなが答えやすい質問をひとつ添えると、ネオンラプトルがさらに育ちます。",
    toneKeywords: ["明るい", "巻き込む", "テンポ"],
    rarity: "rare",
    element: "ネオン",
    evolutionStage: 2,
    evolutionStageName: "成長期",
    badgeLabel: "場づくり",
    silhouetteEmoji: "🦖",
    iconEmoji: "🦖✨",
    colorHint: "neon",
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
    displayName: "ガードケラトプス",
    speciesName: "ガードケラトプス属",
    title: "安心感で支える聞き上手",
    shortSummary: "相手の言葉を受け止め、落ち着ける足場を作る守護型恐竜。",
    description: "急いで結論を出さず、相手の気持ちや状況を丁寧に受け止めます。共感や振り返りを含む投稿が増えるほど、信頼される支え役として育ちます。",
    traits: ["傾聴", "安心感", "誠実", "落ち着き"],
    growthSignals: ["相手を気遣う言葉", "感情を整理した振り返り", "穏やかな助言", "感謝や労いの共有"],
    aiScoreHints: ["事実っぽさが高く、盛ってる度が控えめな投稿と好相性です", "ネタ度よりも穏やかな理由説明が成長材料になります"],
    evolutionHint: "次は、相手の気持ちを受け止めたうえで自分の経験を一つ添えると、ガードケラトプスが育ちます。",
    toneKeywords: ["穏やか", "受け止める", "信頼"],
    rarity: "rare",
    element: "守護",
    evolutionStage: 2,
    evolutionStageName: "成長期",
    badgeLabel: "安心ガード",
    silhouetteEmoji: "🦕",
    iconEmoji: "🦕🛡️",
    colorHint: "ocean",
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
    displayName: "ハーモニサウルス",
    speciesName: "ハーモニサウルス属",
    title: "違いをつなぐ調整型",
    shortSummary: "意見の違いから共通点を見つけ、会話を前へ運ぶ調和型恐竜。",
    description: "対立を勝ち負けにせず、それぞれの立場を言葉にして橋をかけます。複数の視点や合意点を示す投稿が、調整役としての輪郭を強くします。",
    traits: ["共感", "調整力", "協力的", "公平"],
    growthSignals: ["複数の立場を紹介する投稿", "共通点の発見", "対話を促す提案", "協力への感謝"],
    aiScoreHints: ["事実っぽさと穏やかな表現のバランスが成長に寄与します", "自慢・マウント感が低い投稿と好相性です"],
    evolutionHint: "次は、異なる意見の共通点を一つ言葉にすると、ハーモニサウルスがさらに育ちます。",
    toneKeywords: ["橋渡し", "共感", "バランス"],
    rarity: "common",
    element: "調和",
    evolutionStage: 1,
    evolutionStageName: "発見期",
    badgeLabel: "橋渡し",
    silhouetteEmoji: "🦕",
    iconEmoji: "🦕🤝",
    colorHint: "harmony",
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
    displayName: "ムードドン",
    speciesName: "ムードドン属",
    title: "言葉の温度を整える空気読み型",
    shortSummary: "場の空気に合わせて、言葉の濃さと温度を上手に調整する感性派恐竜。",
    description: "同じ内容でも、相手や場面に合う伝え方を選びます。雰囲気の描写や気遣いのある一言が増えるほど、ムードを整える力が育ちます。",
    traits: ["空気を読む", "気遣い", "表現力", "柔軟"],
    growthSignals: ["場の雰囲気を描く投稿", "相手に合わせた言い換え", "感情の温度を伝える一言", "さりげない気遣い"],
    aiScoreHints: ["ネタ・ジョーク度を場面に合わせて使う投稿と好相性です", "盛ってる度と事実っぽさのバランスが個性になります"],
    evolutionHint: "次は、その場の空気がどう変わったかまで書くと、ムードドンの感性がさらに育ちます。",
    toneKeywords: ["温度感", "気配り", "表現"],
    rarity: "common",
    element: "温度",
    evolutionStage: 1,
    evolutionStageName: "発見期",
    badgeLabel: "空気調律",
    silhouetteEmoji: "🦕",
    iconEmoji: "🦕🎨",
    colorHint: "sunset",
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
    displayName: "カオスレックス",
    speciesName: "カオスレックス属",
    title: "予想外を笑いに変える爆発型",
    shortSummary: "日常のズレやハプニングを、勢いのある笑いへ変えるトリックスター恐竜。",
    description: "予想外の展開や大胆なたとえで、タイムラインに強いアクセントを作ります。失敗談やオチのある短文が積み重なるほど、愛されるカオスが育ちます。",
    traits: ["ユーモア", "大胆", "瞬発力", "意外性"],
    growthSignals: ["オチのある失敗談", "意外なたとえ", "勢いのある短文", "日常のズレへのツッコミ"],
    aiScoreHints: ["ネタ・ジョーク度と盛ってる度が高めの投稿で育ちやすいです", "事実っぽさを少し残すと笑いが伝わりやすくなります"],
    evolutionHint: "次は、勢いのある一言に具体的な状況を一つ足すと、カオスレックスの笑いがさらに育ちます。",
    toneKeywords: ["笑い", "勢い", "予想外"],
    rarity: "epic",
    element: "混沌",
    evolutionStage: 3,
    evolutionStageName: "覚醒期",
    badgeLabel: "笑撃",
    silhouetteEmoji: "🦖",
    iconEmoji: "🦖💥",
    colorHint: "chaos",
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
    displayName: "スパークプテラ",
    speciesName: "スパークプテラ属",
    title: "ひらめきを素早く飛ばす発想型",
    shortSummary: "小さな違和感からアイデアを着火し、軽やかに共有する発想派恐竜。",
    description: "完成前の考えでも、面白い種を見つけると素早く言葉にします。新しい試みや仮説、試作の共有が増えるほど、発想の翼が大きく育ちます。",
    traits: ["好奇心", "発想力", "スピード", "挑戦的"],
    growthSignals: ["新しいアイデア", "試してみた報告", "小さな仮説", "次に作りたいもの"],
    aiScoreHints: ["軽い盛ってる度やネタ・ジョーク度が発想の勢いになります", "具体的な事実を一つ添えると成長シグナルが強まります"],
    evolutionHint: "次は、思いつきに『まず何を試すか』を添えると、スパークプテラがさらに高く飛びます。",
    toneKeywords: ["ひらめき", "軽快", "挑戦"],
    rarity: "rare",
    element: "閃光",
    evolutionStage: 2,
    evolutionStageName: "成長期",
    badgeLabel: "発想着火",
    silhouetteEmoji: "🦖",
    iconEmoji: "🦖⚡",
    colorHint: "spark",
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
    displayName: "クエストラプトル",
    speciesName: "クエストラプトル属",
    title: "問いを楽しむ探究型",
    shortSummary: "素朴な疑問を楽しい探究へ変え、みんなの好奇心を刺激する恐竜。",
    description: "当たり前をそのまま受け取らず、面白い角度から『なぜ？』を投げかけます。質問、比較、気づきの投稿が積み重なるほど、探究心が鋭く育ちます。",
    traits: ["探究心", "質問上手", "ユーモア", "観察力"],
    growthSignals: ["素朴な疑問", "比較して気づいたこと", "答えを募る問いかけ", "調べて分かった発見"],
    aiScoreHints: ["事実っぽさとネタ・ジョーク度が両立した投稿と好相性です", "断定を少し控えて問いを残すと個性が伸びます"],
    evolutionHint: "次は、疑問に自分なりの仮説を一つ添えると、クエストラプトルの探究力が育ちます。",
    toneKeywords: ["なぜ", "発見", "好奇心"],
    rarity: "rare",
    element: "探究",
    evolutionStage: 2,
    evolutionStageName: "成長期",
    badgeLabel: "なぜ発見",
    silhouetteEmoji: "🦖",
    iconEmoji: "🦖❓",
    colorHint: "curiosity",
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
    displayName: "ロジックラプトル",
    speciesName: "ロジックラプトル属",
    title: "根拠と検証で進む実装型",
    shortSummary: "整理された進捗と検証結果で育つ、実装型の知性派恐竜。",
    description: "感覚だけで決めず、事実と意見を分けて判断材料を共有します。具体的な作業ログ、比較、改善メモが増えるほど、頼れる分析力が育ちます。",
    traits: ["論理的", "検証好き", "具体的", "改善志向"],
    growthSignals: ["実装や作業の進捗", "検証結果", "数値を使った比較", "改善メモや学び"],
    aiScoreHints: ["事実っぽさが高く、盛ってる度が低い投稿と好相性です", "自慢よりも根拠や再現手順を示すほど育ちやすくなります"],
    evolutionHint: "次は、なぜその方法を選んだのかまで書くと、ロジックラプトルの思考力がさらに育ちます。",
    toneKeywords: ["根拠", "検証", "改善"],
    rarity: "epic",
    element: "論理",
    evolutionStage: 3,
    evolutionStageName: "覚醒期",
    badgeLabel: "検証知性",
    silhouetteEmoji: "🦖",
    iconEmoji: "🦖🧠",
    colorHint: "logic",
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
    displayName: "ルナストラドン",
    speciesName: "ルナストラドン属",
    title: "静かに次の一手を組み立てる戦略型",
    shortSummary: "状況を俯瞰し、無理のない次の一手を設計する夜型の戦略恐竜。",
    description: "目の前の出来事だけでなく、目的や順序まで整理して考えます。計画、優先順位、振り返りの投稿が積み重なるほど、先を読む力が育ちます。",
    traits: ["戦略的", "計画的", "冷静", "俯瞰"],
    growthSignals: ["次の一手の整理", "優先順位の共有", "計画の振り返り", "リスクと対策"],
    aiScoreHints: ["事実っぽさが高く、盛ってる度が控えめな投稿と好相性です", "自慢よりも判断理由を示すと戦略性が伸びます"],
    evolutionHint: "次は、目標・制約・次の一手をセットで書くと、ルナストラドンの戦略眼が育ちます。",
    toneKeywords: ["計画", "俯瞰", "次の一手"],
    rarity: "epic",
    element: "月影",
    evolutionStage: 3,
    evolutionStageName: "覚醒期",
    badgeLabel: "戦略眼",
    silhouetteEmoji: "🦕",
    iconEmoji: "🦕🌙",
    colorHint: "moon",
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
    displayName: "ノクタサウルス",
    speciesName: "ノクタサウルス属",
    title: "問いを深める内省型",
    shortSummary: "静かな観察と深い振り返りから、本質を見つける思索派恐竜。",
    description: "すぐに答えへ飛びつかず、気づきや迷いを丁寧に掘り下げます。長めの振り返りや考えの変化を共有するほど、落ち着いた知性が育ちます。",
    traits: ["内省的", "深掘り", "静か", "洞察力"],
    growthSignals: ["一日の深い振り返り", "考えが変わった理由", "まだ答えのない問い", "観察から得た洞察"],
    aiScoreHints: ["事実っぽさが高く、ネタ度や盛ってる度が控えめな投稿と好相性です", "断定よりも思考の過程を見せると育ちます"],
    evolutionHint: "次は、考えが変わったきっかけを具体的に書くと、ノクタサウルスの洞察が深まります。",
    toneKeywords: ["内省", "静けさ", "洞察"],
    rarity: "epic",
    element: "深淵",
    evolutionStage: 3,
    evolutionStageName: "覚醒期",
    badgeLabel: "深夜思索",
    silhouetteEmoji: "🦕",
    iconEmoji: "🦕🔭",
    colorHint: "mist",
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
    displayName: "マコトレックス",
    speciesName: "マコトレックス属",
    title: "本質をまっすぐ届ける直球型",
    shortSummary: "余分なノイズを外し、大切な論点を誠実に届けるストレート型恐竜。",
    description: "曖昧な表現を減らし、何が大切かを短く明確に伝えます。結論、理由、具体例が揃った投稿が増えるほど、言葉の芯が強く育ちます。",
    traits: ["誠実", "率直", "明快", "本質志向"],
    growthSignals: ["結論が明確な投稿", "理由を添えた意見", "誤解をほどく説明", "大切な論点の整理"],
    aiScoreHints: ["事実っぽさが高く、盛ってる度が低い投稿と特に好相性です", "自慢・マウント感を抑えるほど誠実さが伝わります"],
    evolutionHint: "次は、結論の根拠になる具体例を一つ添えると、マコトレックスの言葉がさらに強くなります。",
    toneKeywords: ["率直", "明快", "誠実"],
    rarity: "legendary",
    element: "真実",
    evolutionStage: 3,
    evolutionStageName: "最終進化",
    badgeLabel: "真芯",
    silhouetteEmoji: "🦖",
    iconEmoji: "🦖🏹",
    colorHint: "truth",
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
    displayName: "グロウケラトプス",
    speciesName: "グロウケラトプス属",
    title: "小さな前進を育てる継続型",
    shortSummary: "人やアイデアの小さな変化を見つけ、丁寧に育てる伴走型恐竜。",
    description: "派手な成果だけでなく、昨日からの小さな前進を大切にします。継続記録、学び、誰かを励ます投稿が積み重なるほど、育てる力が強くなります。",
    traits: ["継続力", "丁寧", "育成上手", "温かい"],
    growthSignals: ["小さな進捗の記録", "続けて分かったこと", "誰かへの励まし", "試行錯誤の共有"],
    aiScoreHints: ["事実っぽさが高く、穏やかな投稿と好相性です", "大きく盛るより、小さな変化を具体的に書くほど育ちます"],
    evolutionHint: "次は、昨日との違いを一つ書くと、グロウケラトプスの継続力がさらに育ちます。",
    toneKeywords: ["継続", "育成", "丁寧"],
    rarity: "common",
    element: "成長",
    evolutionStage: 1,
    evolutionStageName: "発見期",
    badgeLabel: "継続育成",
    silhouetteEmoji: "🦕",
    iconEmoji: "🦕🌱",
    colorHint: "growth",
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

const UNKNOWN_PERSONA_PROFILE: PersonaProfile = {
  key: "unknown_persona",
  displayName: "ミライサウルス",
  speciesName: "未発見種",
  title: "進化途中の恐竜",
  shortSummary: "投稿の成長シグナルを集めながら、これから個性が見えてくる恐竜。",
  description: "まだ十分な投稿傾向が集まっていないため、進化の途中にいます。投稿を重ねると、あなたらしい恐竜キャラの輪郭が少しずつ見えてきます。",
  traits: ["進化途中", "可能性", "観察中"],
  growthSignals: ["日々の近況", "最近考えたこと", "小さな挑戦"],
  aiScoreHints: ["AI判定の4つの成分が積み重なると、得意な傾向が見えてきます"],
  evolutionHint: "まずは短い近況をいくつか投稿して、成長シグナルを集めてみましょう。",
  toneKeywords: ["これから", "成長", "発見"],
  rarity: "common",
  element: "未知",
  evolutionStage: 1,
  evolutionStageName: "たまご期",
  badgeLabel: "未発見",
  silhouetteEmoji: "🥚",
  iconEmoji: "🦕❔",
  colorHint: "future",
};

export function getPersonaProfile(key: string | null | undefined): PersonaProfile {
  const normalized = String(key ?? "").trim();
  const known = findDefaultPersona(normalized);
  return known ?? { ...UNKNOWN_PERSONA_PROFILE, key: normalized || UNKNOWN_PERSONA_PROFILE.key };
}

export function personaDisplayName(key: string | null | undefined) {
  return getPersonaProfile(key).displayName;
}

export const PERSONA_RARITY_LABELS: Record<PersonaRarity, string> = {
  common: "ノーマル",
  rare: "レア",
  epic: "エピック",
  legendary: "レジェンド",
};

export function getPersonaRarityLabel(key: string | null | undefined) {
  return PERSONA_RARITY_LABELS[getPersonaProfile(key).rarity];
}

export function getPersonaEvolutionStageLabel(key: string | null | undefined) {
  return getPersonaProfile(key).evolutionStageName;
}

export function personaDisplayMetadata(key: string | null | undefined) {
  const profile = getPersonaProfile(key);
  return {
    title: profile.displayName,
    displayName: profile.displayName,
    speciesName: profile.speciesName ?? null,
    roleTitle: profile.title,
    shortSummary: profile.shortSummary,
    description: profile.description,
    traits: profile.traits,
    growthSignals: profile.growthSignals,
    aiScoreHints: profile.aiScoreHints ?? [],
    evolutionHint: profile.evolutionHint,
    toneKeywords: profile.toneKeywords ?? [],
    rarity: profile.rarity,
    rarityLabel: PERSONA_RARITY_LABELS[profile.rarity],
    element: profile.element,
    evolutionStage: profile.evolutionStage,
    evolutionStageName: profile.evolutionStageName,
    badgeLabel: profile.badgeLabel,
    silhouetteEmoji: profile.silhouetteEmoji,
    iconEmoji: profile.iconEmoji,
    colorHint: profile.colorHint,
  };
}

export function defaultPersonaArchetypes() {
  return DEFAULT_PERSONA_CATALOG.map((entry) => ({
    key: entry.key,
    title: entry.displayName,
    displayName: entry.displayName,
    roleTitle: entry.title,
    blurb: entry.shortSummary,
    description: entry.description,
    traits: entry.traits,
    growthSignals: entry.growthSignals,
    aiScoreHints: entry.aiScoreHints ?? [],
    evolutionHint: entry.evolutionHint,
    rarity: entry.rarity,
    element: entry.element,
    evolutionStage: entry.evolutionStage,
    evolutionStageName: entry.evolutionStageName,
    badgeLabel: entry.badgeLabel,
    silhouetteEmoji: entry.silhouetteEmoji,
    iconEmoji: entry.iconEmoji,
    colorHint: entry.colorHint,
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
