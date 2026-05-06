import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { valuateAccount, priceLot } from "@/lib/finance";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  addLot,
  addHoldingPosition,
  deleteLot,
  deleteHoldingPosition,
  updateAccountCash,
  deleteAccount,
} from "@/app/actions/accounts";

export const dynamic = "force-dynamic";

const LOT_ELIGIBLE = new Set(["TAXABLE_BROKERAGE", "CRYPTO"]);

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const account = await prisma.account.findFirst({
    where: { id, userId: user.id },
    include: { lots: { orderBy: { acquiredAt: "desc" } }, positions: true },
  });
  if (!account) notFound();

  const valuation = valuateAccount(account, undefined, user.filingStatus);
  const usesLots = LOT_ELIGIBLE.has(account.type);

  return (
    <div>
      <PageHeader
        title={account.name}
        description={`${account.type.replace(/_/g, " ").toLowerCase()}${account.institution ? ` · ${account.institution}` : ""}`}
        actions={
          <form action={async () => { "use server"; await deleteAccount(account.id); }}>
            <Button variant="outline" size="sm" type="submit">Delete account</Button>
          </form>
        }
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-zinc-500">Total value</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">
                {formatCurrency(valuation.totalValue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-zinc-500">Unrealized gain</div>
              <div className={`text-2xl font-semibold tabular-nums mt-1 ${valuation.unrealizedGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(valuation.unrealizedGain)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-zinc-500">After-tax value</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">
                {formatCurrency(valuation.afterTaxValue)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Cash balance</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={async (fd) => { "use server"; await updateAccountCash(account.id, fd); }} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="cashBalance">Cash</Label>
                <Input
                  id="cashBalance"
                  name="cashBalance"
                  type="number"
                  step="0.01"
                  defaultValue={account.cashBalance}
                  className="mt-1"
                />
              </div>
              <Button type="submit" size="md">Update</Button>
            </form>
          </CardContent>
        </Card>

        {usesLots ? (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Add lot</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={async (fd) => { "use server"; await addLot(account.id, fd); }} className="grid gap-3 md:grid-cols-6">
                  <div className="md:col-span-1">
                    <Label htmlFor="ticker">Ticker</Label>
                    <Input id="ticker" name="ticker" required placeholder="GOOG" className="mt-1 uppercase" />
                  </div>
                  <div className="md:col-span-1">
                    <Label htmlFor="shares">Shares</Label>
                    <Input id="shares" name="shares" type="number" step="0.0001" required className="mt-1" />
                  </div>
                  <div className="md:col-span-1">
                    <Label htmlFor="costBasisPerShare">Basis / share</Label>
                    <Input id="costBasisPerShare" name="costBasisPerShare" type="number" step="0.01" required className="mt-1" />
                  </div>
                  <div className="md:col-span-1">
                    <Label htmlFor="acquiredAt">Acquired</Label>
                    <Input id="acquiredAt" name="acquiredAt" type="date" required className="mt-1" />
                  </div>
                  <div className="md:col-span-1">
                    <Label htmlFor="acquisitionType">Type</Label>
                    <Select id="acquisitionType" name="acquisitionType" className="mt-1">
                      <option value="PURCHASE">Purchase</option>
                      <option value="RSU_VEST">RSU vest</option>
                      <option value="ESPP">ESPP</option>
                      <option value="DIVIDEND_REINVESTMENT">Reinvested div</option>
                      <option value="GIFT">Gift</option>
                      <option value="INHERITANCE">Inheritance</option>
                      <option value="TRANSFER_IN">Transfer in</option>
                    </Select>
                  </div>
                  <div className="md:col-span-1 flex items-end">
                    <Button type="submit" className="w-full">Add lot</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lots ({account.lots.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {account.lots.length === 0 ? (
                  <div className="text-sm text-zinc-500">No lots yet. Add your first one above.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-zinc-500">
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left py-2 pr-4">Ticker</th>
                          <th className="text-right py-2 px-4">Shares</th>
                          <th className="text-right py-2 px-4">Basis/sh</th>
                          <th className="text-right py-2 px-4">Total basis</th>
                          <th className="text-left py-2 px-4">Acquired</th>
                          <th className="text-left py-2 px-4">Hold</th>
                          <th className="text-left py-2 px-4">Type</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.lots.map((lot) => {
                          const priced = priceLot(lot);
                          return (
                            <tr key={lot.id} className="border-b border-zinc-100 dark:border-zinc-900">
                              <td className="py-2 pr-4 font-medium">{lot.ticker}</td>
                              <td className="py-2 px-4 text-right tabular-nums">{lot.shares}</td>
                              <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(lot.costBasisPerShare)}</td>
                              <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(priced.costBasisTotal)}</td>
                              <td className="py-2 px-4">{formatDate(lot.acquiredAt)}</td>
                              <td className="py-2 px-4">
                                <span className={priced.isLongTerm ? "text-emerald-600" : "text-amber-600"}>
                                  {priced.isLongTerm ? "LT" : "ST"}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-xs text-zinc-500">{lot.acquisitionType.replace(/_/g, " ").toLowerCase()}</td>
                              <td className="py-2 pl-4 text-right">
                                <form action={async () => { "use server"; await deleteLot(account.id, lot.id); }}>
                                  <button className="text-xs text-zinc-400 hover:text-red-500">Delete</button>
                                </form>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Add holding</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-zinc-500 mb-3">
                  Tax-advantaged accounts skip lot tracking — just enter the current value of each holding.
                </p>
                <form action={async (fd) => { "use server"; await addHoldingPosition(account.id, fd); }} className="grid gap-3 md:grid-cols-5">
                  <div>
                    <Label htmlFor="ticker">Ticker / fund</Label>
                    <Input id="ticker" name="ticker" required placeholder="VTSAX" className="mt-1 uppercase" />
                  </div>
                  <div>
                    <Label htmlFor="name">Name (optional)</Label>
                    <Input id="name" name="name" placeholder="Total Stock Market" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="shares">Shares</Label>
                    <Input id="shares" name="shares" type="number" step="0.0001" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="currentValue">Current value</Label>
                    <Input id="currentValue" name="currentValue" type="number" step="0.01" required className="mt-1" />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" className="w-full">Add</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Holdings ({account.positions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {account.positions.length === 0 ? (
                  <div className="text-sm text-zinc-500">No holdings yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-zinc-500">
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left py-2 pr-4">Ticker</th>
                          <th className="text-left py-2 px-4">Name</th>
                          <th className="text-right py-2 px-4">Shares</th>
                          <th className="text-right py-2 px-4">Value</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.positions.map((p) => (
                          <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
                            <td className="py-2 pr-4 font-medium">{p.ticker}</td>
                            <td className="py-2 px-4 text-zinc-500">{p.name}</td>
                            <td className="py-2 px-4 text-right tabular-nums">{p.shares}</td>
                            <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(p.currentValue)}</td>
                            <td className="py-2 pl-4 text-right">
                              <form action={async () => { "use server"; await deleteHoldingPosition(account.id, p.id); }}>
                                <button className="text-xs text-zinc-400 hover:text-red-500">Delete</button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageBody>
    </div>
  );
}
