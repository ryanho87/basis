import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  className?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "text-zinc-900 dark:text-zinc-100";

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-semibold tracking-tight tabular-nums", valueClass)}>
          {value}
        </div>
        {hint ? (
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
