"use client";

import Link from "next/link";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { FinancialCapability, PrimaryPersona } from "@/lib/profile-capabilities";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/equity", label: "Equity & RSUs", icon: TrendingUp },
  { href: "/tax", label: "Tax Projection", icon: Calculator },
  { href: "/scenarios", label: "Scenarios", icon: FlaskConical },
  { href: "/strategies", label: "Strategies", icon: Lightbulb },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/onboarding", label: "Onboarding", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

type SidebarProps = {
  persona?: PrimaryPersona | null;
  capabilities?: FinancialCapability[];
};

export function Sidebar({ persona, capabilities = [] }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const authPage = pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/privacy" || pathname === "/terms";

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

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-emerald-600 flex items-center justify-center text-white font-bold">
            B
          </div>
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
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-zinc-200/60 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
              )}
            >
              <Icon className="size-4" />
              {item.label}
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
  );
}
