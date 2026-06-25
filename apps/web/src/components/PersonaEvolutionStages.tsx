import {
  PERSONA_EVOLUTION_STAGES,
  type PersonaEvolutionProgress,
} from "@/lib/personaEvolution";

export default function PersonaEvolutionStages({
  progress,
  preview = false,
  compact = false,
  className = "",
}: {
  progress?: PersonaEvolutionProgress | null;
  preview?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const unlocked = new Set(progress?.unlockedStages ?? []);

  return (
    <div
      className={`flex flex-wrap gap-1.5 ${className}`}
      aria-label={preview && !progress ? "4つの進化段階のプレビュー" : "進化段階"}
    >
      {PERSONA_EVOLUTION_STAGES.map((stage) => {
        const isUnlocked = unlocked.has(stage.key);
        const isCurrent = progress?.stage.key === stage.key;
        const previewOnly = preview && !progress;
        return (
          <span
            key={stage.key}
            aria-current={isCurrent ? "step" : undefined}
            title={stage.description}
            className={`inline-flex items-center rounded-full border font-medium ${
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
            } ${
              isCurrent
                ? "border-indigo-300 bg-indigo-600 text-white shadow-sm"
                : isUnlocked
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : previewOnly
                    ? "border-slate-200 bg-white/80 text-slate-600"
                    : "border-slate-200 bg-slate-100/80 text-slate-400"
            }`}
          >
            Lv.{stage.level} {compact ? stage.shortLabel : stage.label}
          </span>
        );
      })}
    </div>
  );
}
