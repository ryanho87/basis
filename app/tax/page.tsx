import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { projectIncome } from "@/lib/finance";
import { computeTax } from "@/lib/tax";
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
  addW2Snapshot,
  updateUserTaxSettings,
} from "@/app/actions/income";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const user = await getCurrentUser();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      paycheckProfile: true,
      sCorpProfile: true,
      w2Snapshots: { orderBy: { snapshotDate: "desc" } },
      rsuGrants: { include: { vestEvents: true } },
    },
  });
  if (!data) return null;

  const taxYear = new Date().getFullYear();
  const projection = projectIncome({
    taxYear,
    paycheck: data.paycheckProfile,
    sCorp: data.sCorpProfile,
    latestW2: data.w2Snapshots[0] ?? null,
    rsuGrants: data.rsuGrants,
  });

  const tax = computeTax({
    filingStatus: data.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });

  return (
    <div>
      <PageHeader
        title={`Tax Projection (${taxYear})`}
        description="Income projection, threshold tracking, and bracket room"
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

          <Card>
            <CardHeader>
              <CardTitle>S-Corp profile</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-zinc-500">
                Optional — fill out if you operate through an S-Corp.
              </p>
              <form action={upsertSCorpProfile} className="space-y-3">
                <div>
                  <Label htmlFor="corpName">Corp name</Label>
                  <Input id="corpName" name="corpName" defaultValue={data.sCorpProfile?.corpName ?? ""} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="annualRevenue">Annual revenue</Label>
                    <Input id="annualRevenue" name="annualRevenue" type="number" step="0.01" defaultValue={data.sCorpProfile?.annualRevenue ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="operatingExpenses">Operating expenses</Label>
                    <Input id="operatingExpenses" name="operatingExpenses" type="number" step="0.01" defaultValue={data.sCorpProfile?.operatingExpenses ?? ""} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="w2SalaryFromCorp">W-2 salary from corp</Label>
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
              <CardTitle>YTD W-2 snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-zinc-500">
                Add a snapshot from your latest paycheck to project from. You can add multiple per year.
              </p>
              <form action={addW2Snapshot} className="space-y-3">
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
                <Button type="submit" size="sm">Add snapshot</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {data.w2Snapshots.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>W-2 snapshot history</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 px-4">Year</th>
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
