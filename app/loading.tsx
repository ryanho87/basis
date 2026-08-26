export default function AppLoading() {
  return (
    <div className="animate-pulse" aria-label="Loading page" aria-live="polite">
      <div className="border-b border-zinc-200 px-5 py-6 dark:border-zinc-800 sm:px-8">
        <div className="h-6 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-2 h-4 w-64 max-w-full rounded bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="space-y-5 px-5 py-6 sm:px-8">
        <div className="h-36 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>
    </div>
  );
}
