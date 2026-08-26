import Link from "next/link";
import { createAccount } from "@/app/actions/accounts";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const TYPES = [
  { value: "TAXABLE_BROKERAGE", label: "Taxable Brokerage" },
  { value: "K401_TRADITIONAL", label: "401(k) Traditional" },
  { value: "K401_ROTH", label: "401(k) Roth" },
  { value: "IRA_TRADITIONAL", label: "IRA Traditional" },
  { value: "IRA_ROTH", label: "IRA Roth" },
  { value: "HSA", label: "HSA" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "OTHER", label: "Other" },
];

export default function NewAccountPage() {
  return (
    <div>
      <PageHeader
        title="Add account"
        description="Investment, retirement, cash, or crypto"
        actions={
          <Link href="/accounts" className="text-sm text-zinc-500 hover:text-zinc-900">
            Cancel
          </Link>
        }
      />
      <PageBody>
        <Card className="max-w-xl">
          <CardContent className="p-6">
            <form action={createAccount} className="space-y-4">
              <div>
                <Label htmlFor="name">Account name</Label>
                <Input id="name" name="name" required placeholder="e.g. Schwab Brokerage" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="institution">Institution (optional)</Label>
                <Input id="institution" name="institution" placeholder="Schwab, Fidelity, E*Trade…" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Select id="type" name="type" required className="mt-1">
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="cashBalance">Cash balance</Label>
                <Input
                  id="cashBalance"
                  name="cashBalance"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  For checking/savings, this is the balance. For brokerage, it&apos;s settled cash.
                </p>
              </div>
              <div className="pt-2 flex gap-2">
                <Button type="submit">Create account</Button>
                <Link href="/accounts">
                  <Button type="button" variant="ghost">Cancel</Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageBody>
    </div>
  );
}
