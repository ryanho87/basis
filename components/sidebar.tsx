"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Calculator,
  MessageSquare,
  Settings,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/equity", label: "Equity & RSUs", icon: TrendingUp },
  { href: "/tax", label: "Tax Projection", icon: Calculator },
  { href: "/strategies", label: "Strategies", icon: Lightbulb },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/onboarding", label: "Onboarding", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
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
        {NAV.map((item) => {
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
      <div className="p-4 text-[11px] text-zinc-500 dark:text-zinc-500">
        v0.1 · solo build
      </div>
    </aside>
  );
}
