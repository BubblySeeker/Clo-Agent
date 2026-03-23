"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface KeyValueCardProps {
  title?: string;
  pairs: Array<{ label: string; value: string }>;
  compact?: boolean;
}

const STATUS_WORDS = new Set([
  "active",
  "closed",
  "pending",
  "open",
  "won",
  "lost",
  "completed",
  "in progress",
  "approved",
  "denied",
  "expired",
  "enabled",
  "disabled",
  "yes",
  "no",
  "true",
  "false",
]);

function isCurrency(value: string): boolean {
  return /^\$[\d,]+/.test(value.trim());
}

function isStatus(value: string): boolean {
  return STATUS_WORDS.has(value.trim().toLowerCase());
}

function getStatusVariant(
  value: string
): "default" | "secondary" | "destructive" | "outline" {
  const lower = value.trim().toLowerCase();
  if (["active", "open", "won", "completed", "approved", "enabled", "yes", "true"].includes(lower))
    return "default";
  if (["closed", "lost", "denied", "expired", "disabled", "no", "false"].includes(lower))
    return "destructive";
  return "secondary";
}

export default function KeyValueCard({
  title,
  pairs,
  compact,
}: KeyValueCardProps) {
  return (
    <Card className={`my-2 ${compact ? "shadow-none border-gray-200" : ""}`}>
      {title && (
        <CardHeader className={compact ? "px-3 py-2 pb-0" : "px-4 py-3 pb-0"}>
          <CardTitle
            className={`${compact ? "text-xs" : "text-sm"} font-semibold text-[#1E3A5F]`}
          >
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={compact ? "px-3 py-2" : "px-4 py-3"}>
        <div
          className={`grid gap-x-4 gap-y-2 ${
            compact ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {pairs.map((p, i) => (
            <div key={i} className="min-w-0">
              <div
                className={`text-gray-500 font-medium ${
                  compact ? "text-[10px]" : "text-xs"
                }`}
              >
                {p.label}
              </div>
              <div
                className={`font-medium truncate ${
                  compact ? "text-xs" : "text-sm"
                } ${isCurrency(p.value) ? "text-green-600 font-semibold" : "text-gray-900"}`}
              >
                {isStatus(p.value) ? (
                  <Badge
                    variant={getStatusVariant(p.value)}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {p.value}
                  </Badge>
                ) : (
                  p.value
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
