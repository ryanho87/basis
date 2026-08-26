import Link from "next/link";
import { ShieldCheck } from "lucide-react";

interface LegalSection {
  title: string;
  paragraphs: React.ReactNode[];
}

export function LegalPage({ title, summary, updated, sections }: { title: string; summary: string; updated: string; sections: LegalSection[] }) {
  return (
    <div className="min-h-screen bg-zinc-50 px-5 py-10 dark:bg-zinc-950 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/sign-in" className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-4 dark:focus-visible:ring-offset-zinc-950">
            <span className="flex size-9 items-center justify-center rounded-md bg-emerald-600 font-bold text-white dark:bg-emerald-500">B</span>
            <span>
              <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-50">Basis</span>
              <span className="block text-xs text-zinc-500">Private financial planning</span>
            </span>
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Privacy first
          </span>
        </header>

        <article className="rounded-xl border border-zinc-200 bg-white px-6 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">The paperwork, translated</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-zinc-600 dark:text-zinc-300">{summary}</p>
          <p className="mt-3 text-xs text-zinc-500">Last updated {updated}</p>

          <div className="mt-10 space-y-9">
            {sections.map((section) => (
              <section key={section.title} aria-labelledby={section.title.toLowerCase().replaceAll(" ", "-")}>
                <h2 id={section.title.toLowerCase().replaceAll(" ", "-")} className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                  {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
        </article>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <p>Basis provides planning estimates, not tax, legal, or investment advice.</p>
          <nav aria-label="Legal navigation" className="flex gap-4">
            <Link href="/privacy" className="underline-offset-4 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">Privacy</Link>
            <Link href="/terms" className="underline-offset-4 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">Terms</Link>
            <Link href="/sign-in" className="font-medium text-zinc-800 underline-offset-4 hover:underline dark:text-zinc-200">Sign in</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
