import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MoneyPlanner } from "@/components/money-planner";
import { PageBody, PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/user";
import { buildMoneyPlan } from "@/lib/money-plan";
import { loadMoneyPlan } from "@/lib/money-plan-server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MoneyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await getCurrentUser();
  const { year } = await searchParams;
  const plan = await loadMoneyPlan(user.id, year);
  const live = buildMoneyPlan(plan.baseline, plan.levers, plan.commitments);
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const hasIncome = live.summary.totalCompensation > 0;
  const sourceLinks = [
    plan.baseline.sCorp
      ? { href: "/tax#s-corp-profile", label: `${plan.corpName || "Practice"} revenue, expenses, and owner payroll` }
      : { href: "/tax", label: "Salary, bonus, and payroll deductions" },
    plan.baseline.rsuVestValue > 0 || !plan.baseline.sCorp
      ? { href: "/equity", label: "RSU grants and vest schedule" }
      : null,
    { href: "/tax#income-snapshot", label: "Latest pay stub or W-2 snapshot" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  return (
    <div>
      <PageHeader
        title="Money plan"
        description="Total compensation to left-for-life, with levers you can move before you commit."
        actions={
          <nav aria-label="Plan year" className="flex w-full items-center gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800 sm:w-auto">
            {years.map((option) => {
              const active = option === plan.planYear;
              return (
                <Link
                  key={option}
                  href={option === currentYear ? "/plan" : `/plan?year=${option}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                    active
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                  )}
                >
                  {option}
                </Link>
              );
            })}
          </nav>
        }
      />
      <PageBody className="max-w-6xl">
        {hasIncome ? (
          <MoneyPlanner
            key={`${plan.planYear}-${plan.commitments.map((c) => c.id).join(",")}`}
            baseline={plan.baseline}
            savedLevers={plan.levers}
            savedCommitments={plan.commitments}
            planYear={plan.planYear}
          />
        ) : (
          <EmptyState
            title={`Basis needs ${plan.planYear} income before it can plan around it`}
            description={
              plan.baseline.sCorp
                ? "Add expected revenue, operating expenses, and owner payroll for your practice. Three numbers, and the waterfall fills itself in."
                : "Add a paycheck profile, import a pay stub, or record RSU grants. Basis builds the plan from what actually pays you, not from a number you typed into a chatbot."
            }
            ctaLabel="Add income on the Tax page"
            ctaHref="/tax"
          />
        )}

        <section aria-labelledby="sources-heading" className="mt-8 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 id="sources-heading" className="text-sm font-semibold">Where the starting point comes from</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            The top of the plan is live data, not an assumption. Change it at the source and the plan follows.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {sourceLinks.map((link) => (
              <li key={link.href + link.label}>
                <Link href={link.href} className="group inline-flex items-center gap-1 text-sm font-medium hover:text-emerald-700 dark:hover:text-emerald-400">
                  {link.label}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </div>
  );
}
