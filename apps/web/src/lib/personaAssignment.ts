type PostSignal = {
  id: string;
  created_at: string;
  analysis?: any;
};

type PostScoreSignal = {
  post_id: string;
  persona_key: string;
  final_score: number | null;
};

export type DerivedPersonaRow = {
  persona_key: string;
  score: number;
  confidence: number;
  count: number;
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function normalizeScore01(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return clamp(n, 0, 1);
  if (n <= 100) return clamp(n / 100, 0, 1);
  return 1;
}

function parseAnalysis(raw: any) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function postRecencyWeight(createdAt: string, nowMs: number) {
  const ms = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(ms)) return 1;
  const days = Math.max(0, (nowMs - ms) / (1000 * 60 * 60 * 24));
  const halfLifeDays = 14;
  const w = Math.pow(0.5, days / halfLifeDays);
  return clamp(w, 0.35, 1);
}

function analysisCandidates(analysis: any) {
  const selected = String(analysis?.persona?.selected ?? "").trim();
  const candidates = Array.isArray(analysis?.persona?.candidates)
    ? analysis.persona.candidates
    : [];
  const out: Array<{ key: string; weight: number }> = [];

  if (selected) {
    out.push({ key: selected, weight: 1 });
  }

  const normalizedCandidates = candidates
    .map((c: any) => ({
      key: String(c?.key ?? "").trim(),
      score: Number(c?.score ?? 0),
    }))
    .filter((c) => c.key.length > 0);

  const maxScore = Math.max(
    1,
    ...normalizedCandidates.map((c) => (Number.isFinite(c.score) ? c.score : 0))
  );
  normalizedCandidates.slice(0, 4).forEach((c) => {
    const norm = clamp((Number.isFinite(c.score) ? c.score : 0) / maxScore, 0, 1);
    const w = 0.45 + norm * 0.55;
    if (!out.some((x) => x.key === c.key)) out.push({ key: c.key, weight: w });
  });

  return out;
}

export function derivePersonaRowsFromSignals(args: {
  posts: PostSignal[];
  scoreRows?: PostScoreSignal[];
  limit?: number;
}): DerivedPersonaRow[] {
  const { posts, scoreRows = [], limit = 12 } = args;
  if (!posts.length) return [];

  const topByPost = new Map<string, { key: string; score: number }>();
  scoreRows.forEach((r) => {
    if (!r?.post_id || !r?.persona_key) return;
    const score = normalizeScore01(r.final_score);
    const cur = topByPost.get(r.post_id);
    if (!cur || score > cur.score) {
      topByPost.set(r.post_id, {
        key: r.persona_key,
        score,
      });
    }
  });

  const nowMs = Date.now();
  const stats = new Map<string, { total: number; count: number }>();
  const add = (key: string, value: number) => {
    if (!key) return;
    const cur = stats.get(key) ?? { total: 0, count: 0 };
    cur.total += value;
    cur.count += 1;
    stats.set(key, cur);
  };

  posts.forEach((p) => {
    if (!p?.id) return;
    const recency = postRecencyWeight(p.created_at, nowMs);
    const scored = topByPost.get(p.id);
    if (scored) {
      add(scored.key, (0.75 + scored.score * 0.65) * recency);
      return;
    }

    const analysis = parseAnalysis(p.analysis);
    const candidates = analysisCandidates(analysis);
    candidates.forEach((c) => {
      add(c.key, c.weight * recency * 0.95);
    });
  });

  if (!stats.size) return [];

  const maxTotal = Math.max(...Array.from(stats.values()).map((v) => v.total));
  const totalMass = Math.max(
    1e-6,
    Array.from(stats.values()).reduce((acc, x) => acc + x.total, 0)
  );

  return Array.from(stats.entries())
    .map(([persona_key, s]) => {
      const score = clamp(s.total / Math.max(1e-6, maxTotal), 0, 1);
      const coverage = clamp((s.total / totalMass) * 3.2, 0, 1);
      const support = clamp(Math.log1p(s.count) / Math.log1p(10), 0, 1);
      const confidence = clamp(coverage * 0.6 + support * 0.4, 0.08, 1);
      return {
        persona_key,
        score,
        confidence,
        count: s.count,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.count - a.count;
    })
    .slice(0, Math.max(1, Math.min(24, Math.floor(limit))));
}

export function topPersonaKey(rows: Array<{ persona_key: string; score: number }> | null | undefined) {
  if (!rows?.length) return null;
  return rows[0]?.persona_key ?? null;
}
