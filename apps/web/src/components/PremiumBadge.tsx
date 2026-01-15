// apps/web/src/components/PremiumBadge.tsx
"use client";

type Props = {
  isPremium: boolean;
};

export default function PremiumBadge({ isPremium }: Props) {
  if (!isPremium) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-yellow-100 to-pink-100 text-[10px] px-2 py-0.5 text-yellow-800 border border-yellow-300/60 ml-2">
      ★ Premium
      <span className="ml-1 text-[9px] text-yellow-700/80">
        （課金機能は準備中）
      </span>
    </span>
  );
}
