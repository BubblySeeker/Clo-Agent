"use client";

interface ScoreBadgeProps {
  score: number;
  previousScore?: number | null;
  size?: "default" | "compact";
}

interface TierColors {
  bg: string;
  text: string;
  border: string;
}

function getTier(score: number): TierColors {
  if (score >= 80) {
    return { bg: "#dcfce7", text: "#16a34a", border: "#86efac" };
  }
  if (score >= 50) {
    return { bg: "#fef9c3", text: "#ca8a04", border: "#fde047" };
  }
  if (score >= 20) {
    return { bg: "#e0f2fe", text: "#0284c7", border: "#7dd3fc" };
  }
  return { bg: "#f1f5f9", text: "#94a3b8", border: "#cbd5e1" };
}

export function ScoreBadge({
  score,
  previousScore,
  size = "default",
}: ScoreBadgeProps) {
  const tier = getTier(score);

  const isDefault = size === "default";
  const circleSize = isDefault ? "42px" : "24px";
  const fontSize = isDefault ? "14px" : "10px";

  const showArrow =
    previousScore != null && Math.abs(score - previousScore) >= 5;
  const isIncrease = showArrow && score > previousScore!;
  const isDecrease = showArrow && score < previousScore!;

  return (
    <span className="inline-flex items-center gap-0.5">
      <span
        className="rounded-full flex items-center justify-center border-2 font-bold leading-none"
        style={{
          width: circleSize,
          height: circleSize,
          fontSize: fontSize,
          backgroundColor: tier.bg,
          color: tier.text,
          borderColor: tier.border,
        }}
      >
        {score}
      </span>
      {isIncrease && (
        <span className="text-xs leading-none" style={{ color: "#16a34a" }}>
          {"\u2191"}
        </span>
      )}
      {isDecrease && (
        <span className="text-xs leading-none" style={{ color: "#ef4444" }}>
          {"\u2193"}
        </span>
      )}
    </span>
  );
}
