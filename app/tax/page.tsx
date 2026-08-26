import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { projectIncome } from "@/lib/finance";
import { computeTax } from "@/lib/tax";
import { getRsuPriceEstimates } from "@/lib/rsu-pricing";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/stat";
import { ThresholdBar } from "@/components/threshold-bar";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  upsertPaycheckProfile,
  upsertSCorpProfile,
  addIncomeSnapshot,
  updateUserTaxSettings,
} from "@/app/actions/income";
import { PayStubUpload } from "@/components/pay-stub-upload";
import { derivePersona } from "@/lib/profile-capabilities";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const user = await getCurrentUser();
  const taxYear = new Date().getFullYear();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      paycheckProfile: true,
      sCorpProfile: true,
      w2Snapshots: { where: { taxYear }, orderBy: { snapshotDate: "desc" } },
      rsuGrants: { include: { vestEvents: true } },
    },
  });
  if (!data) return null;
  const physicianMode = derivePersona(data.primaryPersona, data.profileType) === "PHYSICIAN";

  const rsuPriceEstimate = await getRsuPriceEstimates(user.id, data.rsuGrants.map((grant) => grant.ticker));
  const projection = projectIncome({
    taxYear,
    paycheck: data.paycheckProfile,
    sCorp: data.sCorpProfile,
    latestW2: data.w2Snapshots[0] ?? null,
    rsuGrants: data.rsuGrants,
    rsuPriceEstimate,
  });

  const tax = computeTax({
    taxYear,
    filingStatus: data.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });
  const latestSnapshot = data.w2Snapshots[0] ?? null;
  const payrollCoverageDate = latestSnapshot
    ? new Date(latestSnapshot.payPeriodEnd ?? latestSnapshot.snapshotDate).toISOString().slice(0, 10)
    : null;

  return (
    <div>
      <PageHeader
        title={`${physicianMode ? "Tax Plan" : "Tax Projection"} (${taxYear})`}
        description={physicianMode ? "Payroll, practice income, reserves, and bracket room" : "Income projection, threshold tracking, and bracket room"}
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Stat
            label="Projected ordinary"
            value={formatCurrency(projection.totalProjectedOrdinary, { compact: true })}
          />
          <Stat
            label="Estimated total tax"
            value={formatCurrency(tax.totalTax, { compact: true })}
            hint={`${formatPercent(tax.effectiveRate)} effective`}
          />
          <Stat
            label="Marginal ordinary"
            value={formatPercent(tax.marginalOrdinaryRate)}
            hint={`Next bracket in ${formatCurrency(tax.bracketRoom.nextOrdinaryBracketRoom, { compact: true })}`}
          />
          <Stat
            label="Marginal LTCG"
            value={formatPercent(tax.marginalLtcgRate)}
            hint={tax.bracketRoom.niitOver > 0 ? "Includes NIIT" : "Federal only"}
            tone={tax.bracketRoom.niitOver > 0 ? "warning" : "default"}
          />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Threshold tracker</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <ThresholdBar
                label={`Next ordinary bracket (${tax.bracketRoom.nextOrdinaryBracketRate ? formatPercent(tax.bracketRoom.nextOrdinaryBracketRate) : "top"})`}
                current={tax.taxableOrdinary}
                threshold={tax.taxableOrdinary + tax.bracketRoom.nextOrdinaryBracketRoom}
                unitLabel="of room"
              />
              <ThresholdBar
                label="LTCG 15% bracket"
                current={tax.taxableOrdinary + tax.taxableLtcg}
                threshold={tax.thresholds.ltcg15to20}
                unitLabel="LTCG room before 20%"
                tone="warning"
              />
              <ThresholdBar
                label="NIIT threshold (+3.8% on investment income)"
                current={projection.totalProjectedOrdinary + projection.realizedLTCG}
                threshold={tax.thresholds.niit}
                unitLabel="below threshold"
                tone="warning"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle>Stock-sale headroom</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="LTCG before 20% rate" value={formatCurrency(tax.bracketRoom.ltcgRoomAt15, { compact: true })} hint="Additional long-term gains, federal only" />
              <Stat label="0% LTCG room" value={formatCurrency(tax.bracketRoom.ltcgRoomAt0, { compact: true })} hint="Additional long-term gains" />
              <Stat label="Room before NIIT" value={formatCurrency(Math.max(0, tax.thresholds.niit - projection.totalProjectedOrdinary - projection.realizedLTCG), { compact: true })} hint="Then investment income may face +3.8%" />
            </div>
            <p className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              These are gain amounts, not sale proceeds. Cost basis, filing status, future income, state tax, AMT, and qualified dividends can move the answer—because tax law objects to joy and round numbers.
            </p>
          </CardContent>
        </Card>

        <div id="income-snapshot" className="scroll-mt-6">
          <PayStubUpload />
        </div>

        <section className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="rsu-reconciliation-title">
          <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
            <h2 id="rsu-reconciliation-title" className="text-sm font-semibold">RSU and payroll reconciliation</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {payrollCoverageDate
                ? `Your pay stub covers compensation through ${payrollCoverageDate}. Vests through that date stay inside YTD wages; only later vests are added.`
                : "No current pay stub is setting the payroll cutoff, so confirmed and forecast vests are derived from the equity schedule."}
              {Object.keys(rsuPriceEstimate).length > 0
                ? ` Pending vests use connected planning prices (${Object.entries(rsuPriceEstimate).map(([ticker, price]) => `${ticker} ${formatCurrency(price)}`).join(", ")}) until actual FMV arrives.`
                : ""}
            </p>
          </div>
          <dl className="grid gap-px bg-zinc-100 sm:grid-cols-2 lg:grid-cols-4 dark:bg-zinc-900">
            {[
              { label: "Inside pay-stub wages", value: projection.ytdRsuVestIncome, detail: latestSnapshot?.rsuIncomeIsExplicit ? "Explicit payroll component, not added twice" : "Not isolated by payroll; YTD gross remains authoritative", unknown: Boolean(latestSnapshot && !latestSnapshot.rsuIncomeIsExplicit) },
              { label: "Confirmed after cutoff", value: projection.rsuIncomeAfterSnapshot, detail: "Added from vested shares × FMV" },
              { label: "Future vest estimate", value: projection.upcomingRsuIncome, detail: "Added once to projected income" },
              { label: "Missing a usable FMV", value: projection.unpricedRsuShares, detail: `${projection.unpricedRsuEvents} vest event${projection.unpricedRsuEvents === 1 ? "" : "s"} excluded`, warning: projection.unpricedRsuEvents > 0 },
            ].map((item) => (
              <div key={item.label} className="bg-white px-5 py-4 dark:bg-zinc-950">
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</dt>
                <dd className={`mt-1 text-xl font-semibold tabular-nums ${item.warning ? "text-amber-700 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-100"}`}>
                  {item.unknown ? "Not isolated" : item.label === "Missing a usable FMV" ? `${item.value.toFixed(2)} shares` : formatCurrency(item.value)}
                </dd>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.detail}</p>
              </div>
            ))}
          </dl>
          {projection.unpricedRsuEvents > 0 ? (
            <p role="alert" className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Add FMV-at-vest or a planning price for the missing events. Basis excluded them instead of inventing income, a rare moment of restraint in both software and NVIDIA compensation.
            </p>
          ) : null}
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Filing & state</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateUserTaxSettings} className="space-y-4">
                <div>
                  <Label htmlFor="filingStatus">Filing status</Label>
                  <Select id="filingStatus" name="filingStatus" defaultValue={data.filingStatus} className="mt-1">
                    <option value="SINGLE">Single</option>
                    <option value="MARRIED_FILING_JOINTLY">Married filing jointly</option>
                    <option value="MARRIED_FILING_SEPARATELY">Married filing separately</option>
                    <option value="HEAD_OF_HOUSEHOLD">Head of household</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" defaultValue={data.state ?? ""} placeholder="CA, NY, TX…" className="mt-1" />
                </div>
                <Button type="submit" size="sm">Save</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Paycheck profile (W-2)</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={upsertPaycheckProfile} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="annualSalary">Annual salary</Label>
                    <Input id="annualSalary" name="annualSalary" type="number" step="0.01" defaultValue={data.paycheckProfile?.annualSalary ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="payFrequency">Pay frequency</Label>
                    <Select id="payFrequency" name="payFrequency" defaultValue={data.paycheckProfile?.payFrequency ?? "BIWEEKLY"} className="mt-1">
                      <option value="WEEKLY">Weekly</option>
                      <option value="BIWEEKLY">Biweekly</option>
                      <option value="SEMIMONTHLY">Semimonthly</option>
                      <option value="MONTHLY">Monthly</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="expectedBonus">Expected bonus</Label>
                    <Input id="expectedBonus" name="expectedBonus" type="number" step="0.01" defaultValue={data.paycheckProfile?.expectedBonus ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="bonusMonth">Bonus month</Label>
                    <Input id="bonusMonth" name="bonusMonth" type="number" min="1" max="12" defaultValue={data.paycheckProfile?.bonusMonth ?? ""} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="k401Contribution">401k contrib</Label>
                    <Input id="k401Contribution" name="k401Contribution" type="number" step="0.01" defaultValue={data.paycheckProfile?.k401Contribution ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="hsaContribution">HSA</Label>
                    <Input id="hsaContribution" name="hsaContribution" type="number" step="0.01" defaultValue={data.paycheckProfile?.hsaContribution ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="otherPretax">Other pre-tax</Label>
                    <Input id="otherPretax" name="otherPretax" type="number" step="0.01" defaultValue={data.paycheckProfile?.otherPretax ?? ""} className="mt-1" />
                  </div>
                </div>
                <Button type="submit" size="sm">Save paycheck profile</Button>
              </form>
            </CardContent>
          </Card>

          <Card id="s-corp-profile" className="scroll-mt-6">
            <CardHeader>
              <CardTitle>{physicianMode ? "Practice income" : "S-Corp profile"}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-zinc-500">
                {physicianMode
                  ? "Add the corporation that receives clinical income and runs your owner payroll."
                  : "Optional. Fill this out if you operate through an S-Corp."}
              </p>
              <form action={upsertSCorpProfile} className="space-y-3">
                <div>
                  <Label htmlFor="corpName">Corp name</Label>
                  <Input id="corpName" name="corpName" defaultValue={data.sCorpProfile?.corpName ?? ""} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="annualRevenue">{physicianMode ? "Expected clinical revenue" : "Annual revenue"}</Label>
                    <Input id="annualRevenue" name="annualRevenue" type="number" step="0.01" defaultValue={data.sCorpProfile?.annualRevenue ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="operatingExpenses">Operating expenses</Label>
                    <Input id="operatingExpenses" name="operatingExpenses" type="number" step="0.01" defaultValue={data.sCorpProfile?.operatingExpenses ?? ""} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="w2SalaryFromCorp">{physicianMode ? "Owner payroll salary" : "W-2 salary from corp"}</Label>
                    <Input id="w2SalaryFromCorp" name="w2SalaryFromCorp" type="number" step="0.01" defaultValue={data.sCorpProfile?.w2SalaryFromCorp ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="projectedDistribution">Projected distribution</Label>
                    <Input id="projectedDistribution" name="projectedDistribution" type="number" step="0.01" defaultValue={data.sCorpProfile?.projectedDistribution ?? ""} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="solo401kContribution">Solo 401(k) contribution</Label>
                  <Input id="solo401kContribution" name="solo401kContribution" type="number" step="0.01" defaultValue={data.sCorpProfile?.solo401kContribution ?? ""} className="mt-1" />
                </div>
                <Button type="submit" size="sm">Save S-Corp profile</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual income snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-zinc-500">
                Add a snapshot from your latest paycheck to project from. You can add multiple per year.
              </p>
              <form action={addIncomeSnapshot} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="taxYear">Tax year</Label>
                    <Input id="taxYear" name="taxYear" type="number" defaultValue={taxYear} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="snapshotDate">Snapshot date</Label>
                    <Input id="snapshotDate" name="snapshotDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ytdWages">YTD wages</Label>
                    <Input id="ytdWages" name="ytdWages" type="number" step="0.01" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ytdRsuVestIncome">YTD RSU vest income</Label>
                    <Input id="ytdRsuVestIncome" name="ytdRsuVestIncome" type="number" step="0.01" className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ytdFederalWithheld">YTD federal withheld</Label>
                    <Input id="ytdFederalWithheld" name="ytdFederalWithheld" type="number" step="0.01" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ytdBonuses">YTD bonuses</Label>
                    <Input id="ytdBonuses" name="ytdBonuses" type="number" step="0.01" className="mt-1" />
                  </div>
                </div>
                  <Button type="submit" size="sm">Add manual snapshot</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {data.w2Snapshots.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Income snapshot history</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 px-4">Year</th>
                      <th className="text-left py-2 px-4">Employer</th>
                      <th className="text-right py-2 px-4">YTD wages</th>
                      <th className="text-right py-2 px-4">RSU income</th>
                      <th className="text-right py-2 px-4">Bonuses</th>
                      <th className="text-right py-2 px-4">Fed withheld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.w2Snapshots.map((s) => (
                      <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                        <td className="py-2 pr-4">{new Date(s.snapshotDate).toISOString().slice(0, 10)}</td>
                        <td className="py-2 px-4">{s.taxYear}</td>
                        <td className="py-2 px-4">{s.employerName ?? (s.source === "DOCUMENT_UPLOAD" ? "Legacy W-2" : s.source === "PAY_STUB_UPLOAD" ? "Imported pay stub" : "Manual snapshot")}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(s.ytdWages)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(s.ytdRsuVestIncome)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(s.ytdBonuses)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(s.ytdFederalWithheld)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </PageBody>
    </div>
  );
}
