import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-zinc-200 px-4 pb-5 pt-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8",
        className,
      )}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex w-full items-center gap-2 sm:w-auto">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-4 py-5 sm:px-6 lg:px-8 lg:py-6", className)}>{children}</div>;
}
