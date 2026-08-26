"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Calculator,
  FlaskConical,
  MessageSquare,
  Settings,
  Lightbulb,
  Sparkles,
  LogOut,
  Stethoscope,
  ReceiptText,
  Menu,
  X,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { FinancialCapability, PrimaryPersona } from "@/lib/profile-capabilities";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/equity", label: "Equity & RSUs", icon: TrendingUp },
  { href: "/tax", label: "Tax Projection", icon: Calculator },
  { href: "/scenarios", label: "Scenarios", icon: FlaskConical },
  { href: "/strategies", label: "Strategies", icon: Lightbulb },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/onboarding", label: "Onboarding", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavigationPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-1 h-0.5 origin-center rounded-full bg-emerald-600 transition-[opacity,transform] duration-150 ease-out dark:bg-emerald-400",
        pending ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
      )}
    />
  );
}

type SidebarProps = {
  persona?: PrimaryPersona | null;
  capabilities?: FinancialCapability[];
};

export function Sidebar({ persona, capabilities = [] }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authPage = pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/privacy" || pathname === "/terms";

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  if (authPage) return null;

  const physicianMode = persona === "PHYSICIAN";
  const hasOwnerBusiness = capabilities.includes("S_CORP") || capabilities.includes("SELF_EMPLOYMENT_INCOME");
  const navigation = NAV
    .filter((item) => !(physicianMode && item.href === "/equity"))
    .map((item) => physicianMode && item.href === "/tax" ? { ...item, label: "Tax Plan" } : item);
  if (physicianMode || hasOwnerBusiness) {
    navigation.splice(2, 0, { href: "/plan", label: "Money Plan", icon: Stethoscope });
    navigation.splice(3, 0, { href: "/expenses", label: "Expenses", icon: ReceiptText });
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const mobilePrimary = navigation.filter((item) => ["/", "/accounts", "/chat"].includes(item.href));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-zinc-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
        <Link href="/" prefetch={false} className="relative flex items-center gap-2" aria-label="Basis dashboard">
          <span className="flex size-8 items-center justify-center rounded-md bg-emerald-600 font-bold text-white">B</span>
          <span className="text-sm font-semibold tracking-tight">Basis</span>
          <NavigationPendingHint />
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex size-10 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:bg-zinc-900"
          aria-label="Open all pages"
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-950 md:flex">
      <div className="px-5 py-5">
        <Link href="/" prefetch={false} className="relative flex items-center gap-2">
          <div className="size-8 rounded-md bg-emerald-600 flex items-center justify-center text-white font-bold">
            B
          </div>
          <NavigationPendingHint />
          <div>
            <div className="text-sm font-semibold tracking-tight">Basis</div>
            <div className="text-[11px] text-zinc-500">Your real financial picture</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-zinc-200/60 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
              )}
            >
              <Icon className="size-4" />
              {item.label}
              <NavigationPendingHint />
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        {session?.user && (
          <div className="mb-2 px-2">
            <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{session.user.name}</p>
            <p className="truncate text-[11px] text-zinc-500">{session.user.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-200/50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          Sign out
        </button>
      </div>
      </aside>

      <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
        {mobilePrimary.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} prefetch={true} onClick={() => setMobileMenuOpen(false)} className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500")}>
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
              <NavigationPendingHint />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", mobileMenuOpen ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500")}
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="size-5" aria-hidden="true" />
          More
        </button>
      </nav>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="All Basis pages">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:bg-zinc-950">
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <p className="text-sm font-semibold">All pages</p>
                {session?.user ? <p className="mt-0.5 max-w-[16rem] truncate text-xs text-zinc-500">{session.user.email}</p> : null}
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex size-10 items-center justify-center rounded-md hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-900" aria-label="Close navigation">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="grid grid-cols-2 gap-2 p-4" aria-label="All pages">
              {navigation.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} prefetch={false} onClick={() => setMobileMenuOpen(false)} className={cn("relative flex min-h-14 items-center gap-3 rounded-lg border px-3 text-sm font-medium", active ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300")}>
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                    <NavigationPendingHint />
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <button type="button" onClick={signOut} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md text-sm text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:bg-zinc-900">
                <LogOut className="size-4" aria-hidden="true" /> Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
