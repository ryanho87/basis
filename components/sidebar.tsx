"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Wallet, TrendingUp, Calculator, FlaskConical,
  MessageSquare, Settings, Lightbulb, Sparkles, LogOut, PiggyBank,
  ReceiptText, Menu, X, ArrowLeftRight, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { FinancialCapability, PrimaryPersona } from "@/lib/profile-capabilities";

const PRIMARY = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/transactions", label: "Spending", icon: ArrowLeftRight },
  { href: "/plan", label: "Money plan", icon: PiggyBank },
];
const TOOLS = [
  { href: "/tax", label: "Income & taxes", icon: Calculator },
  { href: "/equity", label: "Stock grants", icon: TrendingUp },
  { href: "/scenarios", label: "Plan a sale", icon: FlaskConical },
  { href: "/strategies", label: "Suggestions", icon: Lightbulb },
];
const SUPPORT = [
  { href: "/chat", label: "Ask Basis", icon: MessageSquare },
  { href: "/onboarding", label: "Update profile", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];
type NavItem = (typeof PRIMARY)[number];

function NavigationPendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={cn(
    "pointer-events-none absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-emerald-600 transition-opacity motion-reduce:transition-none dark:bg-emerald-400",
    pending ? "opacity-100" : "opacity-0",
  )} />;
}

export function Sidebar({ persona, capabilities = [] }: {
  persona?: PrimaryPersona | null;
  capabilities?: FinancialCapability[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const authPage = ["/sign-in", "/sign-up", "/privacy", "/terms"].includes(pathname);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (mobileMenuOpen) element.showModal();
    else element.close();
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [mobileMenuOpen]);

  if (authPage) return null;
  const active = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  const tools = TOOLS.filter((item) => !(persona === "PHYSICIAN" && item.href === "/equity"));
  if (persona === "PHYSICIAN" || capabilities.includes("S_CORP") || capabilities.includes("SELF_EMPLOYMENT_INCOME")) {
    tools.push({ href: "/expenses", label: "Business expenses", icon: ReceiptText });
  }
  const toolActive = tools.some((item) => active(item.href));
  const moreActive = [...tools, ...SUPPORT].some((item) => active(item.href));

  async function signOut() {
    await authClient.signOut();
    setMobileMenuOpen(false);
    router.push("/sign-in");
    router.refresh();
  }

  function navLink(item: NavItem) {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} prefetch={false} aria-current={active(item.href) ? "page" : undefined}
        onClick={() => setMobileMenuOpen(false)}
        className={cn("relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
          active(item.href) ? "bg-zinc-200/60 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-600 hover:bg-zinc-200/40 dark:text-zinc-400 dark:hover:bg-zinc-800/60")}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />{item.label}<NavigationPendingHint />
      </Link>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center border-b border-zinc-200 bg-zinc-50 px-4 pt-[env(safe-area-inset-top)] dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <Link href="/" prefetch={false} className="relative flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Basis home">
          <span className="flex size-8 items-center justify-center rounded-md bg-emerald-600 font-bold text-zinc-50">B</span>
          <span className="text-sm font-semibold">Basis</span><NavigationPendingHint />
        </Link>
      </header>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-950 md:flex">
        <Link href="/" prefetch={false} className="mx-5 my-6 flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Basis home">
          <span className="flex size-8 items-center justify-center rounded-md bg-emerald-600 font-bold text-zinc-50">B</span>
          <span className="text-sm font-semibold">Basis</span>
        </Link>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3">
          {PRIMARY.map(navLink)}
          <details key={toolActive ? pathname : "tools"} open={toolActive || undefined} className="group pt-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-3 text-sm text-zinc-500 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
              More tools<ChevronDown className="size-4 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-1 space-y-1">{tools.map(navLink)}</div>
          </details>
        </nav>
        <div className="mt-8 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <nav aria-label="Help and settings" className="space-y-1">{SUPPORT.map(navLink)}</nav>
          {session?.user ? <p className="mt-4 truncate px-3 text-xs text-zinc-500">{session.user.name}</p> : null}
          <button type="button" onClick={signOut} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800">
            <LogOut className="size-4" aria-hidden="true" />Sign out
          </button>
        </div>
      </aside>
      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-zinc-50 pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} prefetch={false} aria-current={active(item.href) ? "page" : undefined}
            onClick={() => setMobileMenuOpen(false)}
            className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500", active(item.href) ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500")}>
            <Icon className="size-5" aria-hidden="true" />{item.label}<NavigationPendingHint />
          </Link>;
        })}
        <button type="button" onClick={() => setMobileMenuOpen(true)} aria-expanded={mobileMenuOpen} aria-haspopup="dialog" aria-controls="mobile-navigation"
          className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500", moreActive || mobileMenuOpen ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500")}>
          <Menu className="size-5" aria-hidden="true" />More
        </button>
      </nav>
      <dialog ref={dialog} id="mobile-navigation" aria-labelledby="mobile-navigation-title" onCancel={() => setMobileMenuOpen(false)} onClose={() => setMobileMenuOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border-0 bg-zinc-50 p-0 pb-[env(safe-area-inset-bottom)] text-zinc-900 backdrop:bg-zinc-950/50 dark:bg-zinc-950 dark:text-zinc-100 md:hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 id="mobile-navigation-title" className="font-semibold">More in Basis</h2>
          <button type="button" autoFocus onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" className="flex size-11 items-center justify-center rounded-md hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800"><X className="size-5" aria-hidden="true" /></button>
        </div>
        <nav aria-label="More tools" className="space-y-1 px-4 py-3">{tools.map(navLink)}</nav>
        <nav aria-label="Help and settings" className="space-y-1 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">{SUPPORT.map(navLink)}</nav>
        <button type="button" onClick={signOut} className="mx-4 mb-3 flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><LogOut className="size-4" aria-hidden="true" />Sign out</button>
      </dialog>
    </>
  );
}
