"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileSearch, FileText, LockKeyhole, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type { CostBasisExtraction, CostBasisImportRow } from "@/lib/cost-basis-import";

type AccountOption = { id: string; label: string; detail: string };

const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CostBasisUpload({ accounts }: { accounts: AccountOption[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<CostBasisExtraction | null>(null);

  const totalBasis = useMemo(() => extraction?.rows.reduce((sum, row) => sum + (row.costBasisTotal ?? 0), 0) ?? 0, [extraction]);
  const completeRows = useMemo(() => extraction?.rows.filter((row) => row.ticker && row.acquiredAt && row.quantity !== null && (row.costBasisTotal !== null || row.costBasisPerShare !== null)).length ?? 0, [extraction]);

  function choose(candidate: File | null) {
    setMessage(null);
    setExtraction(null);
    if (!candidate) return setFile(null);
    const extension = candidate.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "csv", "png", "jpg", "jpeg"].includes(extension)) {
      setFile(null);
      setMessage("Choose a PDF, CSV, PNG, or JPEG. Export spreadsheets as CSV for now.");
      return;
    }
    if (candidate.size > 12 * 1024 * 1024) {
      setFile(null);
      setMessage("That file is over the 12 MB limit. Brokerage paperwork has achieved index-fund scale.");
      return;
    }
    setFile(candidate);
  }

  async function analyze() {
    if (!file || !accountId) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/cost-basis/parse", { method: "POST", body: form });
      const body = await response.json() as { extraction?: CostBasisExtraction; error?: string };
      if (!response.ok || !body.extraction) throw new Error(body.error || "Statement analysis failed");
      setExtraction(body.extraction);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Statement analysis failed");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(index: number, field: keyof CostBasisImportRow, raw: string) {
    setExtraction((current) => current ? {
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        [field]: ["quantity", "costBasisPerShare", "costBasisTotal", "currentValue"].includes(field)
          ? raw === "" ? null : Number(raw)
          : raw || null,
      } : row),
    } : current);
  }

  function reset() {
    setFile(null);
    setExtraction(null);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <ol className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 sm:dark:divide-zinc-800" aria-label="Import progress">
        <Step number="1" label="Upload" detail="Choose account and file" state={extraction ? "done" : "active"} />
        <Step number="2" label="Review" detail="Verify every extracted lot" state={extraction ? "active" : "waiting"} />
        <Step number="3" label="Apply" detail="Locked until import storage ships" state="locked" />
      </ol>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="upload-statement-heading">
        <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
          <h2 id="upload-statement-heading" className="text-base font-semibold">Upload a brokerage file</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">Lot-details CSV exports work best. PDFs and screenshots are supported when your brokerage hides useful data behind a print button.</p>
        </div>
        <div className="space-y-5 p-5">
          <div className="max-w-xl">
            <Label htmlFor="basis-account">Apply findings to</Label>
            <Select id="basis-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1" disabled={busy || Boolean(extraction)}>
              {accounts.length === 0 ? <option value="">No eligible investment accounts</option> : null}
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.detail}</option>)}
            </Select>
          </div>

          {!file ? (
            <label
              className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-emerald-500 ${dragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100/70 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-900"}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0] ?? null); }}
            >
              <input ref={inputRef} type="file" className="sr-only" accept=".pdf,.csv,image/png,image/jpeg" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
              <span className="flex size-11 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"><Upload className="size-5" aria-hidden="true" /></span>
              <span className="mt-4 text-sm font-medium">Drop a statement or lot export here</span>
              <span className="mt-1 text-xs text-zinc-500">PDF, CSV, PNG, or JPEG · 12 MB maximum</span>
              <span className="mt-4 text-xs font-medium text-emerald-700 dark:text-emerald-400">Browse files</span>
            </label>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800"><FileText className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{file.name}</p><p className="mt-0.5 text-xs text-zinc-500">{formatBytes(file.size)} · original will not be retained</p></div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}><X className="size-4" /> Remove</Button>
                <Button type="button" size="sm" onClick={analyze} disabled={busy || !accountId || Boolean(extraction)}><FileSearch className="size-4" /> {busy ? "Reading statement…" : extraction ? "Analyzed" : "Analyze file"}</Button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p>The file is sent through your configured AI Gateway for extraction, then discarded. Nothing changes in Basis until a reviewed import is explicitly applied.</p>
          </div>
          {message ? <p role="alert" className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{message}</p> : null}
        </div>
      </section>

      {extraction ? (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="basis-review-heading">
          <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-900">
            <div><h2 id="basis-review-heading" className="text-base font-semibold">Review extracted lots</h2><p className="mt-1 text-sm text-zinc-500">{extraction.institution || "Unknown institution"}{extraction.statementDate ? ` · ${extraction.statementDate}` : " · statement date not found"} · {Math.round(extraction.confidence * 100)}% parser confidence</p></div>
            <Button type="button" size="sm" variant="ghost" onClick={reset}><RotateCcw className="size-4" /> Start over</Button>
          </div>

          {extraction.warnings.length > 0 ? <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-200"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />Check before trusting this</div><ul className="mt-2 list-disc space-y-1 pl-6 text-xs leading-5">{extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}

          <div className="grid gap-px border-b border-zinc-100 bg-zinc-100 sm:grid-cols-3 dark:border-zinc-900 dark:bg-zinc-900">
            <ReviewStat label="Rows extracted" value={String(extraction.rows.length)} detail={`${completeRows} appear complete`} />
            <ReviewStat label="Basis represented" value={money.format(totalBasis)} detail="Before reconciliation" />
            <ReviewStat label="Destination" value={accounts.find((account) => account.id === accountId)?.label ?? "Unknown"} detail="No changes applied" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400"><tr><th className="px-4 py-3 text-left">Ticker</th><th className="px-3 py-3 text-left">Security</th><th className="px-3 py-3 text-left">Acquired</th><th className="px-3 py-3 text-right">Quantity</th><th className="px-3 py-3 text-right">Basis/share</th><th className="px-3 py-3 text-right">Total basis</th><th className="px-4 py-3 text-right">Current value</th></tr></thead>
              <tbody>{extraction.rows.map((row, index) => <EditableRow key={`${index}-${row.ticker}`} row={row} index={index} update={updateRow} />)}</tbody>
            </table>
            {extraction.rows.length === 0 ? <div className="px-5 py-12 text-center"><p className="text-sm font-medium">No usable lots were found</p><p className="mt-1 text-xs text-zinc-500">Try a lot-details or unrealized gain/loss export instead of an account summary.</p></div> : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-900">
            <p className="flex max-w-2xl items-start gap-2 text-xs leading-5 text-zinc-500"><LockKeyhole className="mt-0.5 size-4 shrink-0" />Applying imports is locked until imported lots have durable provenance and Plaid-safe reconciliation. Your draft is visible, but it cannot quietly rewrite tax data.</p>
            <Button type="button" disabled><LockKeyhole className="size-4" /> Apply reviewed lots</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Step({ number, label, detail, state }: { number: string; label: string; detail: string; state: "active" | "done" | "waiting" | "locked" }) {
  return <li className={`flex items-center gap-3 px-4 py-3 ${state === "active" ? "bg-emerald-50 dark:bg-emerald-950/20" : ""}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${state === "active" || state === "done" ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900"}`}>{state === "done" ? <Check className="size-4" /> : state === "locked" ? <LockKeyhole className="size-3.5" /> : number}</span><div><div className="text-sm font-medium">{label}</div><div className="text-xs text-zinc-500">{detail}</div></div></li>;
}

function ReviewStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="bg-white px-5 py-4 dark:bg-zinc-950"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs text-zinc-500">{detail}</div></div>;
}

function EditableRow({ row, index, update }: { row: CostBasisImportRow; index: number; update: (index: number, field: keyof CostBasisImportRow, value: string) => void }) {
  const field = (key: keyof CostBasisImportRow, type: "text" | "number" | "date" = "text") => <Input aria-label={`${String(key)} row ${index + 1}`} type={type} step={type === "number" ? "any" : undefined} value={row[key] ?? ""} onChange={(event) => update(index, key, event.target.value)} className={`h-8 ${type === "number" ? "text-right tabular-nums" : ""}`} />;
  return <tr className="border-t border-zinc-100 dark:border-zinc-900"><td className="px-4 py-2">{field("ticker")}</td><td className="px-3 py-2">{field("securityName")}</td><td className="px-3 py-2">{field("acquiredAt", "date")}</td><td className="px-3 py-2">{field("quantity", "number")}</td><td className="px-3 py-2">{field("costBasisPerShare", "number")}</td><td className="px-3 py-2">{field("costBasisTotal", "number")}</td><td className="px-4 py-2">{field("currentValue", "number")}</td></tr>;
}
