import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { valuateAccount } from "@/lib/finance";
import { formatCurrency } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  TAXABLE_BROKERAGE: "Taxable Brokerage",
  K401_TRADITIONAL: "401(k) Traditional",
  K401_ROTH: "401(k) Roth",
  IRA_TRADITIONAL: "IRA Traditional",
  IRA_ROTH: "IRA Roth",
  HSA: "HSA",
  CRYPTO: "Crypto",
  OTHER: "Other",
};

export default async function AccountsPage() {
  const user = await getCurrentUser();
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    include: { lots: true, positions: true },
    orderBy: { createdAt: "asc" },
  });
  const manualAssets = await prisma.manualAsset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const liabilities = await prisma.liability.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const studentLoans = await prisma.studentLoan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Investment accounts, cash, real estate, and liabilities"
        actions={
          <Link
            href="/accounts/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="size-4" /> Add account
          </Link>
        }
      />
      <PageBody>
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium text-zinc-500">Investment & cash accounts</h2>
            {accounts.length === 0 ? (
              <EmptyState
                title="No accounts yet"
                description="Add your brokerage, 401k, IRA, crypto, or cash accounts to start tracking your portfolio."
                ctaLabel="Add your first account"
                ctaHref="/accounts/new"
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {accounts.map((acct) => {
                  const v = valuateAccount(acct, undefined, user.filingStatus);
                  return (
                    <Link key={acct.id} href={`/accounts/${acct.id}`} className="block">
                      <Card className="hover:border-emerald-500/50 transition-colors">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-sm font-medium">{acct.name}</div>
                              <div className="text-xs text-zinc-500">
                                {TYPE_LABEL[acct.type]}
                                {acct.institution ? ` · ${acct.institution}` : ""}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-base font-semibold tabular-nums">
                                {formatCurrency(v.totalValue, { compact: true })}
                              </div>
                              <div className="text-xs text-zinc-500 tabular-nums">
                                {acct.lots.length + acct.positions.length} positions
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500">Real estate & other assets</h2>
              <Link href="/accounts/manual-asset/new" className="text-xs text-emerald-600 hover:underline">+ Add asset</Link>
            </div>
            {manualAssets.length === 0 ? (
              <Card><CardContent className="p-5 text-sm text-zinc-500">No real estate or other assets yet.</CardContent></Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {manualAssets.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-zinc-500">{a.type.replace("_", " ").toLowerCase()}</div>
                      </div>
                      <div className="text-base font-semibold tabular-nums">
                        {formatCurrency(a.currentValue, { compact: true })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500">Liabilities</h2>
              <Link href="/accounts/liability/new" className="text-xs text-emerald-600 hover:underline">+ Add liability</Link>
            </div>
            {liabilities.length === 0 && studentLoans.length === 0 ? (
              <Card><CardContent className="p-5 text-sm text-zinc-500">No liabilities tracked.</CardContent></Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {liabilities.map((l) => (
                  <Card key={l.id}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{l.name}</div>
                        <div className="text-xs text-zinc-500">
                          {l.type.replace("_", " ").toLowerCase()}
                          {l.interestRate ? ` · ${l.interestRate}%` : ""}
                        </div>
                      </div>
                      <div className="text-base font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {formatCurrency(-l.currentBalance, { compact: true })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {studentLoans.map((l) => (
                  <Card key={l.id}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{l.servicer ?? "Student loan"}</div>
                        <div className="text-xs text-zinc-500">
                          {l.loanType.replace("_", " ").toLowerCase()} · {l.interestRate}%{l.pslfEligible ? " · PSLF" : ""}
                        </div>
                      </div>
                      <div className="text-base font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {formatCurrency(-l.balance, { compact: true })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </PageBody>
    </div>
  );
}
