import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { valuateAccount } from "@/lib/finance";
import { captureNetWorthSnapshot } from "@/lib/net-worth";
import { formatDate } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { PlaidConnections } from "@/components/plaid-connections";
import { PlaidDeveloperSettings } from "@/components/plaid-developer-settings";
import { getPlaidCredentialStatus } from "@/lib/plaid/developer-credentials";
import { CoinbaseConnection } from "@/components/coinbase-connection";
import { SyncAllButton } from "@/components/sync-all-button";
import { isCoinbaseConfigured } from "@/lib/coinbase/config";
import {
  type AccountBreakdownCategory,
  type AccountBreakdownRow,
} from "@/components/net-worth-account-breakdown";
import { AccountsNetWorthTracker } from "@/components/accounts-net-worth-tracker";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  TAXABLE_BROKERAGE: "Taxable brokerage",
  K401_TRADITIONAL: "Traditional 401(k)",
  K401_ROTH: "Roth 401(k)",
  IRA_TRADITIONAL: "Traditional IRA",
  IRA_ROTH: "Roth IRA",
  HSA: "HSA",
  CRYPTO: "Crypto",
  OTHER: "Other",
};

const RETIREMENT_LABELS = ["401k", "401a", "403b", "457", "traditional", "roth", "pension", "ira", "sep", "simple", "thrift", "hsa"];

function manualCategory(type: string): AccountBreakdownCategory {
  if (type === "CHECKING" || type === "SAVINGS") return "cash";
  if (type === "TAXABLE_BROKERAGE") return "investments";
  if (["K401_TRADITIONAL", "K401_ROTH", "IRA_TRADITIONAL", "IRA_ROTH", "HSA"].includes(type)) return "retirement";
  if (type === "CRYPTO") return "crypto";
  return "other";
}

function connectedCategory(type: string, subtype: string | null): AccountBreakdownCategory {
  if (type === "depository") return "cash";
  if (type !== "investment") return "other";
  const normalized = (subtype ?? "").toLowerCase();
  return RETIREMENT_LABELS.some((label) => normalized.includes(label)) ? "retirement" : "investments";
}

function connectedTypeLabel(type: string, subtype: string | null) {
  if (subtype) return subtype.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function freshness(date: Date | null) {
  return date ? `Updated ${formatDate(date)}` : undefined;
}

function basisStatus(covered: number, relevant: number): AccountBreakdownRow["basis"] {
  if (relevant <= 0) return undefined;
  const coverage = covered / relevant;
  if (coverage >= 0.995) return "complete";
  if (coverage > 0) return "partial";
  return "missing";
}

export default async function AccountsPage() {
  const user = await getCurrentUser();
  const [accounts, manualAssets, liabilities, studentLoans, plaidItems, coinbase, netWorthCapture, plaidCredential] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      include: { lots: true, positions: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.manualAsset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.liability.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.studentLoan.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.plaidItem.findMany({
      where: { userId: user.id, status: { not: "DISCONNECTED" } },
      include: {
        accounts: {
          where: { isActive: true },
          include: {
            holdings: {
              where: { isActive: true },
              include: { plaidSecurity: true, taxLots: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.coinbaseConnection.findUnique({
      where: { userId: user.id },
      include: { accounts: { where: { isActive: true } } },
    }),
    captureNetWorthSnapshot(user.id, "DASHBOARD"),
    getPlaidCredentialStatus(user.id),
  ]);
  const netWorth = netWorthCapture.value;

  const rows: AccountBreakdownRow[] = [];

  for (const account of accounts) {
    const value = valuateAccount(account, undefined, user.filingStatus);
    const basisRelevant = account.type === "TAXABLE_BROKERAGE" || account.type === "CRYPTO";
    const lotValue = value.lots.reduce((sum, lot) => sum + lot.currentValue, 0);
    const positionValue = value.positions.reduce((sum, position) => sum + position.currentValue, 0);
    rows.push({
      id: `manual-account-${account.id}`,
      name: account.name,
      institution: account.institution || "Manually tracked",
      detail: TYPE_LABEL[account.type] || "Account",
      value: value.totalValue,
      kind: "asset",
      category: manualCategory(account.type),
      href: `/accounts/${account.id}`,
      basis: basisRelevant ? basisStatus(lotValue, lotValue + positionValue) : undefined,
    });
  }

  for (const asset of manualAssets) {
    rows.push({
      id: `manual-asset-${asset.id}`,
      name: asset.name,
      institution: "Manually tracked",
      detail: asset.type.replaceAll("_", " ").toLowerCase(),
      value: asset.currentValue,
      kind: "asset",
      category: asset.type === "REAL_ESTATE" ? "real-estate" : "other",
    });
  }

  for (const item of plaidItems) {
    for (const account of item.accounts) {
      const type = account.type.toLowerCase();
      const liability = type === "credit" || type === "loan";
      const category = liability ? "debt" : connectedCategory(type, account.subtype);
      let relevantValue = 0;
      let coveredValue = 0;

      if (category === "investments") {
        for (const holding of account.holdings) {
          if (holding.plaidSecurity.isCashEquivalent) continue;
          const holdingValue = Math.max(0, holding.institutionValue);
          relevantValue += holdingValue;
          if (holding.aggregateCostBasis !== null) {
            coveredValue += holdingValue;
          } else {
            coveredValue += holding.taxLots
              .filter((lot) => lot.costBasis !== null && lot.currentValue !== null)
              .reduce((sum, lot) => sum + (lot.currentValue ?? 0), 0);
          }
        }
      }

      rows.push({
        id: `plaid-${account.id}`,
        name: account.name,
        institution: item.institutionName || "Connected institution",
        detail: `${connectedTypeLabel(type, account.subtype)}${account.mask ? ` •••• ${account.mask}` : ""}`,
        value: liability ? Math.max(0, account.currentBalance ?? 0) : (account.currentBalance ?? 0),
        kind: liability ? "liability" : "asset",
        category,
        freshness: freshness(account.lastSyncedAt ?? item.lastSyncedAt),
        basis: category === "investments" ? basisStatus(coveredValue, relevantValue) : undefined,
      });
    }
  }

  const activeCoinbaseAccounts = coinbase?.status === "DISCONNECTED" ? [] : (coinbase?.accounts ?? []);
  if (activeCoinbaseAccounts.length > 0) {
    const taxableValue = activeCoinbaseAccounts
      .filter((account) => !["USD", "USDC"].includes(account.currency))
      .reduce((sum, account) => sum + (account.valueUsd ?? 0), 0);
    rows.push({
      id: "coinbase-portfolio",
      name: "Coinbase portfolio",
      institution: "Coinbase",
      detail: `${activeCoinbaseAccounts.length} wallets`,
      value: activeCoinbaseAccounts.reduce((sum, account) => sum + (account.valueUsd ?? 0), 0),
      kind: "asset",
      category: "crypto",
      freshness: freshness(coinbase?.lastSyncedAt ?? null),
      basis: taxableValue > 0 ? "missing" : undefined,
    });
  }

  for (const liability of liabilities) {
    rows.push({
      id: `manual-liability-${liability.id}`,
      name: liability.name,
      institution: "Manually tracked",
      detail: `${liability.type.replaceAll("_", " ").toLowerCase()}${liability.interestRate ? ` · ${liability.interestRate}% APR` : ""}`,
      value: liability.currentBalance,
      kind: "liability",
      category: "debt",
    });
  }

  for (const loan of studentLoans) {
    rows.push({
      id: `student-loan-${loan.id}`,
      name: loan.servicer || "Student loan",
      institution: "Manually tracked",
      detail: `${loan.loanType.replaceAll("_", " ").toLowerCase()} · ${loan.interestRate}% APR${loan.pslfEligible ? " · PSLF eligible" : ""}`,
      value: loan.balance,
      kind: "liability",
      category: "debt",
    });
  }

  const [aggregateHistoryDescending, accountHistoryDescending] = await Promise.all([
    prisma.netWorthSnapshot.findMany({ where: { userId: user.id }, select: { dateKey: true, capturedAt: true, netWorth: true }, orderBy: { capturedAt: "desc" }, take: 500 }),
    prisma.accountNetWorthSnapshot.findMany({ where: { userId: user.id, accountKey: { in: rows.map((row) => row.id) } }, select: { snapshotKey: true, capturedAt: true, accountKey: true, value: true }, orderBy: { capturedAt: "desc" }, take: 5000 }),
  ]);

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Your money, finally forced into one room. Automatic refresh runs at 6 AM Pacific and around the U.S. market close."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <SyncAllButton disabled={plaidItems.length === 0 && !coinbase} />
            <Link
              href="/accounts/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <Plus className="size-4" /> Add account
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="space-y-8">
          <AccountsNetWorthTracker
            rows={rows}
            netWorth={netWorth.netWorth}
            totalAssets={netWorth.totalAssets}
            totalLiabilities={netWorth.totalLiabilities}
            aggregatePoints={aggregateHistoryDescending.reverse().map((point) => ({ snapshotKey: point.dateKey, capturedAt: point.capturedAt.toISOString(), value: point.netWorth }))}
            accountPoints={accountHistoryDescending.reverse().map((point) => ({ snapshotKey: point.snapshotKey, capturedAt: point.capturedAt.toISOString(), accountKey: point.accountKey, value: point.value }))}
          />

          <section aria-labelledby="connections-heading">
            <div className="mb-4">
              <h2 id="connections-heading" className="text-base font-semibold">Connections</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Refresh balances, repair access, or remove an institution.</p>
            </div>
            <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <PlaidDeveloperSettings initialStatus={plaidCredential} />
              <PlaidConnections
                configured={plaidCredential.configured}
                connections={plaidItems.map((item) => ({
                  id: item.id,
                  institutionName: item.institutionName,
                  status: item.status,
                  lastSyncedAt: item.lastSyncedAt?.toISOString() ?? null,
                  errorMessage: item.errorMessage,
                }))}
              />
              <CoinbaseConnection
                configured={isCoinbaseConfigured()}
                profileEnabled={Boolean(coinbase)}
                connection={coinbase ? {
                  status: coinbase.status,
                  lastSyncedAt: coinbase.lastSyncedAt?.toISOString() ?? null,
                  errorMessage: coinbase.errorMessage,
                  accountCount: coinbase.accounts.length,
                  totalValueUsd: coinbase.accounts.reduce((sum, account) => sum + (account.valueUsd ?? 0), 0),
                  unpricedCount: coinbase.accounts.filter((account) => account.quantity !== 0 && account.valueUsd === null).length,
                } : null}
              />
            </div>
          </section>

          <section aria-labelledby="manual-data-heading">
            <div className="mb-3">
              <h2 id="manual-data-heading" className="text-base font-semibold">Add what connections miss</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">For property, private assets, debts, and institutions still communicating by carrier pigeon.</p>
            </div>
            <nav aria-label="Add manual financial data" className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-zinc-200 lg:dark:divide-zinc-800">
              <ManualDataLink href="/accounts/cost-basis/import" title="Cost basis statement" description="Import brokerage lots" />
              <ManualDataLink href="/accounts/new" title="Financial account" description="Cash or investment account" />
              <ManualDataLink href="/accounts/manual-asset/new" title="Property or asset" description="Real estate, vehicle, private equity" />
              <ManualDataLink href="/accounts/liability/new" title="Liability" description="Mortgage, card, or other debt" />
            </nav>
          </section>
        </div>
      </PageBody>
    </div>
  );
}

function ManualDataLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between border-b border-zinc-200 px-5 py-4 transition-colors last:border-b-0 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:border-zinc-800 dark:hover:bg-zinc-900/50 sm:border-b-0">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{description}</div>
      </div>
      <Plus className="size-4 text-zinc-400 transition-colors group-hover:text-emerald-600" aria-hidden="true" />
    </Link>
  );
}
