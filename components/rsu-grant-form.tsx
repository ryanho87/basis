"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createRsuGrant } from "@/app/actions/equity";
import { MAX_VESTING_MONTHS } from "@/lib/rsu-schedule";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RsuGrantForm() {
  const [state, formAction, pending] = useActionState(createRsuGrant, { error: null });
  const [values, setValues] = useState<Record<string, string>>({
    ticker: "", company: "", grantDate: "", vestStartDate: "", totalShares: "",
    cliffMonths: "12", totalMonths: "48", cadence: "QUARTERLY",
  });
  const field = (name: string) => ({
    name,
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ticker">Stock symbol</Label>
          <Input id="ticker" {...field("ticker")} required placeholder="GOOG" className="mt-1 uppercase" />
        </div>
        <div>
          <Label htmlFor="company">Company (optional)</Label>
          <Input id="company" {...field("company")} placeholder="Google" className="mt-1" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="grantDate">Grant date</Label>
          <Input id="grantDate" {...field("grantDate")} type="date" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="vestStartDate">Vesting start (optional)</Label>
          <Input id="vestStartDate" {...field("vestStartDate")} type="date" aria-describedby="vesting-start-help" className="mt-1" />
          <p id="vesting-start-help" className="mt-1 text-xs text-zinc-500">Leave blank to use the grant date.</p>
        </div>
      </div>
      <div>
        <Label htmlFor="totalShares">Total shares</Label>
        <Input id="totalShares" {...field("totalShares")} type="number" step="0.0001" min="0.0001" required placeholder="1000" className="mt-1" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="cliffMonths">First vest after (months)</Label>
          <Input id="cliffMonths" {...field("cliffMonths")} type="number" min="0" max={MAX_VESTING_MONTHS} step="1" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="totalMonths">Total length (months)</Label>
          <Input id="totalMonths" {...field("totalMonths")} type="number" min="1" max={MAX_VESTING_MONTHS} step="1" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="cadence">Then vest</Label>
          <Select id="cadence" {...field("cadence")} className="mt-1">
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="YEARLY">Yearly</option>
          </Select>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        With the default schedule, 25% of your shares vest after one year, then 6.25% every three months. When shares vest, you can record their market price.
      </p>
      {state.error ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      <div className="pt-2 flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving grant…" : "Add grant"}</Button>
        <Link href="/equity" className="inline-flex min-h-10 items-center rounded-md px-4 text-sm hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800">Cancel</Link>
      </div>
    </form>
  );
}
