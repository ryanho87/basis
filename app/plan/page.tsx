import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, ReceiptText, Stethoscope } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { projectIncome } from "@/lib/finance";
import { buildPhysicianMoneyPlan } from "@/lib/physician-planning";
import { computeTax } from "@/lib/tax";
import { formatCurrency, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MoneyPlanPage() {
  const user = await getCurrentUser();
  const taxYear = new Date().getFullYear();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      paycheckProfile: true,
      sCorpProfile: true,
      w2Snapshots: { where: { taxYear }, orderBy: { snapshotDate: "desc" }, take: 1 },
      rsuGrants: { include: { vestEvents: true } },
    },
  });
  if (!data) return null;

  if (!data.sCorpProfile) {
    return (
      <div>
        <PageHeader
          title="Money plan"
          description="Turn practice income into a short list of decisions"
        />
        <PageBody className="max-w-5xl">
          <EmptyState
            title="Add your practice income first"
            description="Basis needs expected revenue, operating expenses, owner payroll, and retirement contributions before it can suggest how much cash to reserve or distribute. Four inputs, because your tax return already has enough side quests."
            ctaLabel="Set up practice income"
            ctaHref="/tax#s-corp-profile"
          />
        </PageBody>
      </div>
    );
  }

  const latestW2 = data.w2Snapshots[0] ?? null;
  const plan = buildPhysicianMoneyPlan({
    taxYear,
    annualRevenue: data.sCorpProfile.annualRevenue,
    operatingExpenses: data.sCorpProfile.operatingExpenses,
    ownerW2Salary: data.sCorpProfile.w2SalaryFromCorp,
    plannedRetirementContribution: data.sCorpProfile.solo401kContribution,
    plannedCashDistribution: data.sCorpProfile.projectedDistribution,
  });
  const projection = projectIncome({
    taxYear,
    paycheck: data.paycheckProfile,
    sCorp: data.sCorpProfile,
    latestW2,
    rsuGrants: data.rsuGrants,
  });
  const tax = computeTax({
    taxYear,
    filingStatus: data.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });
  const federalWithheld = latestW2?.ytdFederalWithheld ?? 0;
  const federalReserveBeforePayments = Math.max(0, tax.totalTax - federalWithheld);
  const cashAfterFederalReserve = plan.estimatedCashBeforeOwnerDistribution - federalReserveBeforePayments;
  const salaryShare = plan.annualRevenue > plan.operatingExpenses
    ? plan.ownerW2Salary / (plan.annualRevenue - plan.operatingExpenses)
    : 0;

  return (
    <div>
      <PageHeader
        title="Money plan"
        description={`${data.sCorpProfile.corpName || "Your practice"}, ${taxYear} planning estimate`}
        actions={
          <Link
            href="/tax#s-corp-profile"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-100 px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            Edit assumptions
          </Link>
        }
      />
      <PageBody className="max-w-6xl">
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 text-zinc-50 dark:border-zinc-800">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
                <Stethoscope className="size-4" aria-hidden="true" />
                Estimated cash after commitments
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {formatCurrency(cashAfterFederalReserve, { compact: true })}
              </p>
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-zinc-400">
                After operating expenses, owner payroll, employer payroll taxes, planned retirement contributions, and estimated federal income tax. Estimated payments already made are not yet tracked, so this number is deliberately conservative.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-zinc-800 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <PlanMetric label="Revenue" value={formatCurrency(plan.annualRevenue, { compact: true })} />
              <PlanMetric label="Operating costs" value={formatCurrency(plan.operatingExpenses, { compact: true })} />
              <PlanMetric label="Owner payroll" value={formatCurrency(plan.ownerW2Salary, { compact: true })} />
              <PlanMetric label="Pass-through income" value={formatCurrency(plan.estimatedPassThroughIncome, { compact: true })} />
            </div>
          </div>
        </section>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="allocation-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="allocation-heading" className="text-lg font-semibold tracking-tight">Where the money goes</h2>
                <p className="mt-1 text-sm text-zinc-500">Annual plan with a monthly pace for uneven clinical income.</p>
              </div>
              <span className="text-xs text-zinc-500">Planning estimate</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <AllocationRow label="Clinical revenue" annual={plan.annualRevenue} monthly={plan.monthly.revenue} strong />
              <AllocationRow label="Operating expenses" annual={plan.operatingExpenses} monthly={plan.monthly.operatingExpenses} />
              <AllocationRow label="Owner W-2 payroll" annual={plan.ownerW2Salary} monthly={plan.monthly.ownerPayroll} />
              <AllocationRow label="Employer payroll taxes" annual={plan.employerPayrollTaxes} monthly={plan.monthly.employerPayrollTaxes} />
              <AllocationRow label="Retirement contributions" annual={plan.totalRetirementContribution} monthly={plan.monthly.retirement} />
              <AllocationRow label="Federal tax reserve before estimated payments" annual={federalReserveBeforePayments} monthly={federalReserveBeforePayments / 12} />
              <AllocationRow label="Cash remaining" annual={cashAfterFederalReserve} monthly={cashAfterFederalReserve / 12} strong />
            </div>
          </section>

          <aside className="space-y-6">
            <section aria-labelledby="next-moves-heading">
              <h2 id="next-moves-heading" className="text-sm font-semibold">Next moves</h2>
              <ol className="mt-3 space-y-4">
                {!latestW2 ? (
                  <ActionItem
                    number="1"
                    title="Import the latest Gusto pay stub"
                    description="This replaces guessed withholding and payroll progress with current numbers."
                    href="/tax#income-snapshot"
                  />
                ) : null}
                <ActionItem
                  number={latestW2 ? "1" : "2"}
                  title="Confirm estimated payments"
                  description="Basis does not track payments already sent yet, so the federal reserve is intentionally high."
                  href="/tax"
                />
                {plan.retirementHeadroom > 0 ? (
                  <ActionItem
                    number={latestW2 ? "2" : "3"}
                    title="Review retirement headroom"
                    description={`${formatCurrency(plan.retirementHeadroom)} may remain under the illustrative limit from this payroll. Reconcile every employer plan first.`}
                    href="/tax#s-corp-profile"
                  />
                ) : null}
              </ol>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-zinc-500" aria-hidden="true" />
                  Assumption check
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <CheckLine label="Owner salary share" value={formatPercent(salaryShare)} />
                <CheckLine label="Federal effective rate" value={formatPercent(tax.effectiveRate)} />
                <CheckLine label="Retirement ceiling" value={formatCurrency(plan.illustrativeRetirementCeiling)} />
                <p className="pt-1 text-xs leading-5 text-zinc-500">
                  The retirement ceiling excludes catch-up contributions and assumes no elective deferrals through another employer.
                </p>
              </CardContent>
            </Card>

            {plan.warnings.length > 0 ? (
              <div className="rounded-xl bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CircleAlert className="size-4" aria-hidden="true" />
                  Needs confirmation
                </div>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-900/80 dark:text-amber-100/75">
                  {plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </PageBody>
    </div>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-medium tabular-nums text-zinc-100">{value}</p>
    </div>
  );
}

function AllocationRow({ label, annual, monthly, strong = false }: { label: string; annual: number; monthly: number; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-zinc-200 px-4 py-3.5 last:border-b-0 dark:border-zinc-800 sm:grid-cols-[minmax(0,1fr)_120px_120px] ${strong ? "bg-zinc-50 font-medium dark:bg-zinc-900/60" : ""}`}>
      <span className="text-sm">{label}</span>
      <span className="hidden text-right text-xs text-zinc-500 sm:block">Annual</span>
      <span className="hidden text-right text-xs text-zinc-500 sm:block">Monthly pace</span>
      <span className="text-right text-sm tabular-nums sm:col-start-2 sm:row-start-2">{formatCurrency(annual)}</span>
      <span className="hidden text-right text-sm tabular-nums sm:block sm:col-start-3 sm:row-start-2">{formatCurrency(monthly)}</span>
    </div>
  );
}

function ActionItem({ number, title, description, href }: { number: string; title: string; description: string; href: string }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{number}</span>
      <div>
        <Link href={href} className="group inline-flex items-center gap-1 text-sm font-medium hover:text-emerald-700 dark:hover:text-emerald-400">
          {title}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </li>
  );
}

function CheckLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}
