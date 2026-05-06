import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 flex flex-col items-center text-center">
        <div className="text-base font-medium">{title}</div>
        <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="mt-4 inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
