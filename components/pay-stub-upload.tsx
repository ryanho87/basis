"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileCheck2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { PayStubExtraction } from "@/lib/pay-stub";

type MoneyKey = {
  [K in keyof PayStubExtraction]: PayStubExtraction[K] extends number | null ? K : never
}[keyof PayStubExtraction];

const moneyFields: Array<{ key: MoneyKey; label: string }> = [
  { key: "ytdGrossPay", label: "YTD gross pay" },
  { key: "currentGrossPay", label: "Current gross pay" },
  { key: "currentNetPay", label: "Current net pay" },
  { key: "ytdFederalWithheld", label: "YTD federal withheld" },
  { key: "ytdStateWithheld", label: "YTD state withheld" },
  { key: "ytdSocialSecurity", label: "YTD Social Security" },
  { key: "ytdMedicare", label: "YTD Medicare" },
  { key: "ytdPretaxDeductions", label: "YTD pre-tax deductions" },
  { key: "ytdRetirement", label: "YTD 401(k) / retirement" },
  { key: "ytdHsa", label: "YTD HSA" },
  { key: "ytdBonuses", label: "YTD bonuses" },
  { key: "ytdRsuVestIncome", label: "YTD stock comp income" },
];

export function PayStubUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [value, setValue] = useState<PayStubExtraction | null>(null);
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function parse() {
    if (!file) return;
    setBusy("parse");
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/pay-stub/parse", { method: "POST", body: form });
      const body = (await response.json()) as { extraction?: PayStubExtraction; error?: string };
      if (!response.ok || !body.extraction) throw new Error(body.error || "Pay-stub parsing failed");
      setValue(body.extraction);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pay-stub parsing failed");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!value) return;
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch("/api/pay-stub/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Pay stub could not be saved");
      setMessage("Pay stub saved. Basis now knows where this year's money went, even if you remain emotionally unprepared for the answer.");
      setFile(null);
      setValue(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pay stub could not be saved");
    } finally {
      setBusy(null);
    }
  }

  function setMoney(key: MoneyKey, raw: string) {
    setValue((current) => current ? { ...current, [key]: raw === "" ? null : Number(raw) } : current);
  }

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 border-b border-zinc-100 p-5 dark:border-zinc-900 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-emerald-600" />
            <h2 className="text-sm font-semibold">Import your latest pay stub</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Upload a PDF, PNG, or JPEG to replace stale salary guesses with current YTD pay, withholding, and pre-tax deductions. Basis sends it to your AI Gateway, never stores the original, and saves nothing until you review it.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><ShieldCheck className="size-3.5" /> Review required</span>
      </div>

      <div className="p-5">
        {!value ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="pay-stub-file">Pay stub document</Label>
              <Input id="pay-stub-file" type="file" accept="application/pdf,image/png,image/jpeg" className="mt-1 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
            <Button type="button" disabled={!file || busy !== null} onClick={parse}>
              <Upload className="size-4" /> {busy === "parse" ? "Reading payroll hieroglyphics…" : "Analyze pay stub"}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div><p className="text-sm font-medium">Extraction ready for review</p><p className="mt-1 text-xs text-zinc-500">Model confidence: {Math.round(value.confidence * 100)}%. Payroll PDFs are chaos in business casual—check every number.</p></div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setValue(null)}>Choose another file</Button>
            </div>

            {value.warnings.length ? <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><div>{value.warnings.join(" ")}</div></div> : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="Pay date" type="date" value={value.payDate ?? ""} onChange={(raw) => setValue({ ...value, payDate: raw || null })} />
              <TextField label="Period start" type="date" value={value.payPeriodStart ?? ""} onChange={(raw) => setValue({ ...value, payPeriodStart: raw || null })} />
              <TextField label="Period end" type="date" value={value.payPeriodEnd ?? ""} onChange={(raw) => setValue({ ...value, payPeriodEnd: raw || null })} />
              <TextField label="Employer" value={value.employerName ?? ""} onChange={(raw) => setValue({ ...value, employerName: raw || null })} />
              <TextField label="Pay frequency" value={value.payFrequency ?? ""} onChange={(raw) => setValue({ ...value, payFrequency: raw || null })} />
              <TextField label="State" value={value.stateCode ?? ""} onChange={(raw) => setValue({ ...value, stateCode: raw.toUpperCase().slice(0, 2) || null })} />
              {moneyFields.map((field) => <MoneyField key={field.key} label={field.label} value={value[field.key]} onChange={(raw) => setMoney(field.key, raw)} />)}
            </div>

            <div className="flex justify-end">
              <Button type="button" disabled={!value.payDate || value.ytdGrossPay === null || busy !== null} onClick={save}>
                <FileCheck2 className="size-4" /> {busy === "save" ? "Saving…" : "Confirm current snapshot"}
              </Button>
            </div>
          </div>
        )}
        {message ? <p role="status" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}
      </div>
    </section>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: string) => void }) {
  const id = `pay-stub-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min="0" step="0.01" value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="mt-1" /></div>;
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "date" }) {
  const id = `pay-stub-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1" /></div>;
}
