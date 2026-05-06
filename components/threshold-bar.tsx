import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function ThresholdBar({
  label,
  current,
  threshold,
  unitLabel = "to",
  tone = "default",
}: {
  label: string;
  current: number;
  threshold: number;
  unitLabel?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const ratio = threshold > 0 ? Math.min(1.5, current / threshold) : 0;
  const overBy = current - threshold;
  const room = threshold - current;
  const crossed = current >= threshold;

  const fillColor = crossed
    ? tone === "danger"
      ? "bg-red-500"
      : "bg-amber-500"
    : "bg-emerald-500";

  return (
    <div>
      <div className="flex justify-between items-baseline text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            "tabular-nums text-xs",
            crossed ? "text-amber-600 dark:text-amber-400" : "text-zinc-500",
          )}
        >
          {crossed
            ? `over by ${formatCurrency(overBy)}`
            : `${formatCurrency(room)} ${unitLabel} threshold`}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative">
        <div
          className={cn("h-full transition-all", fillColor)}
          style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }}
        />
        {crossed && (
          <div
            className="absolute top-0 h-full w-px bg-zinc-400"
            style={{ left: `${Math.min(99, (threshold / current) * 100).toFixed(1)}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
        <span>{formatCurrency(current, { compact: true })}</span>
        <span>{formatCurrency(threshold, { compact: true })}</span>
      </div>
    </div>
  );
}
