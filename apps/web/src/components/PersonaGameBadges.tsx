import {
  getPersonaProfile,
  PERSONA_RARITY_LABELS,
  type PersonaRarity,
} from "@/lib/personaCatalog";

const RARITY_CLASSES: Record<PersonaRarity, string> = {
  common: "border-slate-200 bg-slate-50 text-slate-700",
  rare: "border-blue-200 bg-blue-50 text-blue-700",
  epic: "border-violet-200 bg-violet-50 text-violet-700",
  legendary: "border-amber-300 bg-amber-50 text-amber-800",
};

const COLOR_CLASSES: Record<string, { card: string; accent: string; soft: string }> = {
  neon: { card: "from-fuchsia-50 via-white to-cyan-50", accent: "text-fuchsia-700", soft: "bg-fuchsia-100" },
  ocean: { card: "from-sky-50 via-white to-blue-50", accent: "text-sky-700", soft: "bg-sky-100" },
  harmony: { card: "from-emerald-50 via-white to-teal-50", accent: "text-emerald-700", soft: "bg-emerald-100" },
  sunset: { card: "from-orange-50 via-white to-rose-50", accent: "text-orange-700", soft: "bg-orange-100" },
  chaos: { card: "from-rose-50 via-white to-violet-50", accent: "text-rose-700", soft: "bg-rose-100" },
  spark: { card: "from-yellow-50 via-white to-orange-50", accent: "text-amber-700", soft: "bg-amber-100" },
  curiosity: { card: "from-cyan-50 via-white to-indigo-50", accent: "text-cyan-700", soft: "bg-cyan-100" },
  logic: { card: "from-blue-50 via-white to-slate-50", accent: "text-blue-700", soft: "bg-blue-100" },
  moon: { card: "from-indigo-50 via-white to-purple-50", accent: "text-indigo-700", soft: "bg-indigo-100" },
  mist: { card: "from-slate-100 via-white to-violet-50", accent: "text-slate-700", soft: "bg-slate-200" },
  truth: { card: "from-amber-50 via-white to-yellow-50", accent: "text-amber-800", soft: "bg-amber-100" },
  growth: { card: "from-lime-50 via-white to-emerald-50", accent: "text-lime-800", soft: "bg-lime-100" },
  future: { card: "from-slate-100 via-white to-slate-50", accent: "text-slate-600", soft: "bg-slate-200" },
};

export function getPersonaColorClasses(personaKey: string | null | undefined) {
  const hint = getPersonaProfile(personaKey).colorHint;
  return COLOR_CLASSES[hint] ?? COLOR_CLASSES.future;
}

export function PersonaGameBadges({
  personaKey,
  className = "",
  evolutionStageLabel,
  showEvolutionStage = true,
}: {
  personaKey: string | null | undefined;
  className?: string;
  evolutionStageLabel?: string | null;
  showEvolutionStage?: boolean;
}) {
  const profile = getPersonaProfile(personaKey);
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RARITY_CLASSES[profile.rarity]}`}>
        {PERSONA_RARITY_LABELS[profile.rarity]}
      </span>
      {showEvolutionStage && (
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
          {evolutionStageLabel ?? profile.evolutionStageName}
        </span>
      )}
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        {profile.element}
      </span>
    </div>
  );
}
