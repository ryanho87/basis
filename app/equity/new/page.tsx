import Link from "next/link";
import { createRsuGrant } from "@/app/actions/equity";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewRsuGrantPage() {
  return (
    <div>
      <PageHeader
        title="Add RSU grant"
        description="We'll auto-generate the vest schedule"
      />
      <PageBody>
        <Card className="max-w-xl">
          <CardContent className="p-6">
            <form action={createRsuGrant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ticker">Ticker</Label>
                  <Input id="ticker" name="ticker" required placeholder="GOOG" className="mt-1 uppercase" />
                </div>
                <div>
                  <Label htmlFor="company">Company (optional)</Label>
                  <Input id="company" name="company" placeholder="Google" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="grantDate">Grant date</Label>
                  <Input id="grantDate" name="grantDate" type="date" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="vestStartDate">Vesting start (often = grant)</Label>
                  <Input id="vestStartDate" name="vestStartDate" type="date" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="totalShares">Total shares</Label>
                <Input id="totalShares" name="totalShares" type="number" step="0.0001" required placeholder="1000" className="mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="cliffMonths">Cliff (months)</Label>
                  <Input id="cliffMonths" name="cliffMonths" type="number" defaultValue="12" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="totalMonths">Total length (months)</Label>
                  <Input id="totalMonths" name="totalMonths" type="number" defaultValue="48" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="cadence">Cadence</Label>
                  <Select id="cadence" name="cadence" defaultValue="QUARTERLY" className="mt-1">
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="YEARLY">Yearly</option>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Standard tech grant: 12 month cliff + quarterly vesting over 48 months. We&apos;ll generate the schedule and you can mark each vest as it happens with the FMV.
              </p>
              <div className="pt-2 flex gap-2">
                <Button type="submit">Add grant</Button>
                <Link href="/equity">
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
