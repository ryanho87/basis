import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CostBasisUpload } from "@/components/cost-basis-upload";
import { PageBody, PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function CostBasisImportPage() {
  const user = await getCurrentUser();
  const [manual, plaidItems] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, type: { in: ["TAXABLE_BROKERAGE", "CRYPTO"] } }, orderBy: { name: "asc" } }),
    prisma.plaidItem.findMany({ where: { userId: user.id, status: { not: "DISCONNECTED" } }, include: { accounts: { where: { isActive: true, type: "investment" }, orderBy: { name: "asc" } } }, orderBy: { institutionName: "asc" } }),
  ]);
  const accounts = [
    ...plaidItems.flatMap((item) => item.accounts.map((account) => ({ id: `plaid:${account.id}`, label: `${item.institutionName || "Connected institution"} · ${account.name}`, detail: `${account.subtype?.replaceAll("_", " ") || "investment"}${account.mask ? ` •••• ${account.mask}` : ""}` }))),
    ...manual.map((account) => ({ id: `manual:${account.id}`, label: `${account.institution || "Manual"} · ${account.name}`, detail: account.type.replaceAll("_", " ").toLowerCase() })),
  ];

  return <div><PageHeader title="Import cost basis" description="Turn brokerage paperwork into reviewable tax lots" actions={<Link href="/accounts" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:bg-zinc-900"><ArrowLeft className="size-4" /> Accounts</Link>} /><PageBody><CostBasisUpload accounts={accounts} /></PageBody></div>;
}
