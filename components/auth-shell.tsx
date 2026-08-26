import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 px-5 py-10 dark:bg-zinc-950 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-emerald-600 font-bold text-white dark:bg-emerald-500">B</div>
            <div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Basis</div>
              <div className="text-xs text-zinc-500">Private financial planning</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500"><ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Invite only</div>
        </div>

        <section aria-labelledby="auth-title" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">{eyebrow}</p>
          <h1 id="auth-title" className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h1>
          <p className="mt-2 max-w-[52ch] text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
          {children}
        </section>

        <div className="mx-auto mt-5 max-w-sm text-center text-xs leading-5 text-zinc-500">
          <p>Basis provides planning estimates, not filing advice. It can judge your concentration risk, but it cannot represent you before the IRS.</p>
          <nav aria-label="Legal navigation" className="mt-2 flex justify-center gap-4">
            <Link href="/privacy" className="underline-offset-4 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">Privacy</Link>
            <Link href="/terms" className="underline-offset-4 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">Terms</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
