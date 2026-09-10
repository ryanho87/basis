"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Info, Plus, RotateCcw, Trash2 } from "lucide-react";
import { saveMoneyPlan, type SaveMoneyPlanState } from "@/app/actions/money-plan";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  buildMoneyPlan,
  diffPlans,
  leverDefinitions,
  resolveLever,
  PLAN_AMOUNT_MODES,
  PLAN_AMOUNT_MODE_LABELS,
  PLAN_COMMITMENT_KINDS,
  PLAN_COMMITMENT_KIND_LABELS,
  type LeverDefinition,
  type MoneyPlanBaseline,
  type PlanCommitmentInput,
  type PlanLevers,
  type PlanRow,
} from "@/lib/money-plan";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type Props = {
  baseline: MoneyPlanBaseline;
  savedLevers: PlanLevers;
  savedCommitments: PlanCommitmentInput[];
  planYear: number;
};

const INITIAL_STATE: SaveMoneyPlanState = { status: "idle", message: null, savedAt: null };

const PRESETS: Array<Omit<PlanCommitmentInput, "id" | "active">> = [
  { name: "House fund", kind: "SAVINGS", amountMode: "ANNUAL", amount: 0 },
  { name: "Taxable brokerage", kind: "SAVINGS", amountMode: "MONTHLY", amount: 0 },
  { name: "Backdoor Roth IRA", kind: "SAVINGS", amountMode: "ANNUAL", amount: 7500 },
  { name: "Student loans", kind: "DEBT", amountMode: "MONTHLY", amount: 0 },
  { name: "Rent or mortgage", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 0 },
  { name: "Car payment", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 0 },
];

function newId() {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

function sameLevers(a: PlanLevers, b: PlanLevers) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameCommitments(a: PlanCommitmentInput[], b: PlanCommitmentInput[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function signed(value: number) {
  const abs = formatCurrency(Math.abs(value), { compact: true });
  return value >= 0 ? `+${abs}` : `−${abs}`;
}

export function MoneyPlanner({ baseline, savedLevers, savedCommitments, planYear }: Props) {
  const router = useRouter();
  const [levers, setLevers] = useState<PlanLevers>(savedLevers);
  const [commitments, setCommitments] = useState<PlanCommitmentInput[]>(savedCommitments);
  const [state, formAction, pending] = useActionState(saveMoneyPlan, INITIAL_STATE);

  // After a save the server re-renders with fresh commitment ids and the page
  // remounts this component (its key includes those ids), so the saved props
  // become the new draft without any state syncing here.
  useEffect(() => {
    if (state.status === "saved") router.refresh();
  }, [state.savedAt, state.status, router]);

  const definitions = useMemo(() => leverDefinitions(baseline), [baseline]);
  const saved = useMemo(() => buildMoneyPlan(baseline, savedLevers, savedCommitments), [baseline, savedLevers, savedCommitments]);
  const draft = useMemo(() => buildMoneyPlan(baseline, levers, commitments), [baseline, levers, commitments]);
  const deltas = useMemo(() => diffPlans(saved, draft), [saved, draft]);
  const dirty = !sameLevers(levers, savedLevers) || !sameCommitments(commitments, savedCommitments);

  const payload = useMemo(
    () => JSON.stringify({ planYear, levers, commitments }),
    [planYear, levers, commitments],
  );

  function updateLever(definition: LeverDefinition, raw: number) {
    const clamped = Math.min(definition.max, Math.max(definition.min, raw));
    setLevers((current) => ({
      ...current,
      [definition.key]: definition.key === "rsuSellFraction" ? clamped : (clamped === definition.liveValue ? null : clamped),
    }));
  }

  function resetLever(definition: LeverDefinition) {
    setLevers((current) => ({ ...current, [definition.key]: definition.key === "rsuSellFraction" ? 0 : null }));
  }

  function updateCommitment(id: string, patch: Partial<PlanCommitmentInput>) {
    setCommitments((current) => current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCommitment(preset?: Omit<PlanCommitmentInput, "id" | "active">) {
    setCommitments((current) => [
      ...current,
      { id: newId(), active: true, ...(preset ?? { name: "", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 0 }) },
    ]);
  }

  function removeCommitment(id: string) {
    setCommitments((current) => current.filter((c) => c.id !== id));
  }

  function discard() {
    setLevers(savedLevers);
    setCommitments(savedCommitments);
  }

  const left = draft.summary.leftForLife;

  return (
    <div className="space-y-8">
      <section aria-labelledby="plan-summary-heading" className="rounded-2xl bg-zinc-950 p-6 text-zinc-100 dark:bg-zinc-900 sm:p-8">
        <h2 id="plan-summary-heading" className="sr-only">Plan summary</h2>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
              Left for life, {planYear}
            </p>
            <p className={cn("mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl", left < 0 ? "text-red-300" : "")}>
              {formatCurrency(draft.summary.leftForLifeMonthly)}<span className="text-lg font-normal text-zinc-400"> / month</span>
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {formatCurrency(left)} a year after taxes and every commitment below
              {deltas["left-for-life"] ? (
                <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-100">
                  {signed(deltas["left-for-life"])} vs saved plan
                </span>
              ) : null}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-zinc-800 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <SummaryMetric label="Total compensation" value={formatCurrency(draft.summary.totalCompensation, { compact: true })} delta={deltas["total-comp"]} />
            <SummaryMetric label="Taxes" value={formatCurrency(draft.summary.taxes, { compact: true })} hint={`${formatPercent(draft.summary.effectiveTaxRate)} of income after pre-tax`} />
            <SummaryMetric label="After-tax income" value={formatCurrency(draft.summary.afterTaxIncome, { compact: true })} delta={deltas["after-tax"]} />
            <SummaryMetric label="Savings rate" value={formatPercent(draft.summary.savingsRate, 0)} hint="Retirement, savings, and kept stock over total comp" />
          </dl>
        </div>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="waterfall-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="waterfall-heading" className="text-lg font-semibold tracking-tight">Where the money goes</h2>
              <p className="mt-1 text-sm text-zinc-500">Annual amounts, a monthly pace, and each line as a share of total compensation.</p>
            </div>
            {dirty ? <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Unsaved draft</span> : <span className="text-xs text-zinc-500">Saved plan</span>}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {draft.sections.map((section, index) => (
              <div key={section.key}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60 sm:grid-cols-[minmax(0,1fr)_110px_100px_72px]">
                  <span>{index + 1}. {section.title}</span>
                  <span className="hidden text-right sm:block">Annual</span>
                  <span className="hidden text-right sm:block">Monthly</span>
                  <span className="hidden text-right sm:block">% comp</span>
                </div>
                {section.rows.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-zinc-500">
                    {section.key === "commitments" ? "No commitments yet. Add the things your money is already spoken for." : "Nothing here yet."}
                  </p>
                ) : null}
                {section.rows.map((r) => <WaterfallRow key={r.key} row={r} delta={deltas[r.key]} />)}
                {section.total ? <WaterfallRow row={section.total} delta={deltas[section.total.key]} strong /> : null}
              </div>
            ))}
          </div>

          {draft.warnings.length > 0 ? (
            <div role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CircleAlert className="size-4" aria-hidden="true" />
                Worth a second look
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-amber-900/80 dark:text-amber-100/75">
                {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
          {draft.notes.length > 0 ? (
            <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="size-4 text-zinc-500" aria-hidden="true" />
                How these numbers were made
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {draft.notes.map((note) => <li key={note}>{note}</li>)}
                <li>Taxes use the standard deduction and ignore itemizing, AMT, credits, and estimated payments already made. This is a plan, not a return.</li>
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="levers-heading" className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 id="levers-heading" className="text-sm font-semibold">Levers</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Drag away from the live value to see what changes. Nothing is saved until you say so.</p>
            <div className="mt-4 space-y-5">
              {definitions.map((definition) => {
                const value = resolveLever(levers, definition);
                const changed = definition.key === "rsuSellFraction" ? value !== 0 : levers[definition.key] !== null;
                const inputId = `lever-${definition.key}`;
                return (
                  <div key={definition.key}>
                    <div className="flex items-start justify-between gap-3">
                      <Label htmlFor={inputId}>{definition.label}</Label>
                      <span className="text-sm font-medium tabular-nums">
                        {definition.format === "percent" ? formatPercent(value, 0) : formatCurrency(value)}
                      </span>
                    </div>
                    <input
                      id={inputId}
                      type="range"
                      className="mt-2 w-full accent-emerald-600"
                      min={definition.min}
                      max={definition.max}
                      step={definition.step}
                      value={value}
                      onChange={(event) => updateLever(definition, Number(event.target.value))}
                      aria-describedby={`${inputId}-help`}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p id={`${inputId}-help`} className="text-xs leading-5 text-zinc-500">{definition.description}</p>
                      {changed ? (
                        <button type="button" onClick={() => resetLever(definition)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-zinc-600 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300">
                          <RotateCcw className="size-3" aria-hidden="true" />
                          Live value
                        </button>
                      ) : null}
                    </div>
                    {definition.format === "currency" ? (
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={`${definition.label}, exact amount`}
                        className="mt-2 h-9"
                        min={definition.min}
                        max={definition.max}
                        step={definition.step}
                        value={Math.round(value)}
                        onChange={(event) => updateLever(definition, Number(event.target.value) || 0)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="commitments-heading" className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 id="commitments-heading" className="text-sm font-semibold">Commitments</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Savings goals, debt payments, and fixed bills that come out before &ldquo;left for life.&rdquo;</p>
            <ul className="mt-4 space-y-3">
              {commitments.map((commitment) => (
                <li key={commitment.id} className={cn("rounded-lg border border-zinc-200 p-3 dark:border-zinc-800", !commitment.active && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Commitment name"
                      placeholder="Name"
                      className="h-9"
                      value={commitment.name}
                      onChange={(event) => updateCommitment(commitment.id, { name: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeCommitment(commitment.id)}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800"
                      aria-label={`Remove ${commitment.name || "commitment"}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      aria-label="Amount"
                      className="h-9"
                      value={commitment.amount}
                      onChange={(event) => updateCommitment(commitment.id, { amount: Number(event.target.value) || 0 })}
                    />
                    <Select
                      aria-label="Amount basis"
                      className="h-9"
                      value={commitment.amountMode}
                      onChange={(event) => updateCommitment(commitment.id, { amountMode: event.target.value as PlanCommitmentInput["amountMode"] })}
                    >
                      {PLAN_AMOUNT_MODES.map((mode) => <option key={mode} value={mode}>{PLAN_AMOUNT_MODE_LABELS[mode]}</option>)}
                    </Select>
                    <Select
                      aria-label="Commitment type"
                      className="h-9"
                      value={commitment.kind}
                      onChange={(event) => updateCommitment(commitment.id, { kind: event.target.value as PlanCommitmentInput["kind"] })}
                    >
                      {PLAN_COMMITMENT_KINDS.map((kind) => <option key={kind} value={kind}>{PLAN_COMMITMENT_KIND_LABELS[kind]}</option>)}
                    </Select>
                    <label className="flex h-9 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        className="size-4 accent-emerald-600"
                        checked={commitment.active}
                        onChange={(event) => updateCommitment(commitment.id, { active: event.target.checked })}
                      />
                      Counts this year
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {PRESETS.filter((preset) => !commitments.some((c) => c.name === preset.name)).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => addCommitment(preset)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  {preset.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => addCommitment()}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-100 px-3 text-xs font-medium hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <Plus className="size-3" aria-hidden="true" />
                Something else
              </button>
            </div>
          </section>
        </aside>
      </div>

      <form
        action={formAction}
        className={cn(
          "sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 flex flex-col gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur dark:bg-zinc-950/95 sm:flex-row sm:items-center sm:justify-between md:bottom-4",
          dirty ? "border-emerald-300 dark:border-emerald-800" : "border-zinc-200 dark:border-zinc-800",
        )}
        aria-live="polite"
      >
        <input type="hidden" name="payload" value={payload} />
        <p className="text-sm">
          {state.status === "error" ? (
            <span className="text-red-700 dark:text-red-400">{state.message}</span>
          ) : dirty ? (
            <>
              <span className="font-medium">Previewing a draft.</span>{" "}
              <span className="text-zinc-500">Left for life {signed(deltas["left-for-life"] ?? 0)} versus your saved plan.</span>
            </>
          ) : state.status === "saved" ? (
            <span className="text-emerald-700 dark:text-emerald-400">{state.message}</span>
          ) : (
            <span className="text-zinc-500">{baseline.hasPlanRecord ? "This is your saved plan." : "Nothing saved yet. Adjust the levers, add commitments, then save."}</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={discard} disabled={!dirty || pending}>
            Discard draft
          </Button>
          <Button type="submit" size="sm" disabled={(!dirty && baseline.hasPlanRecord) || pending}>
            {pending ? "Saving…" : "Save as my plan"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SummaryMetric({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: number }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-1 text-base font-medium tabular-nums text-zinc-100">
        {value}
        {delta ? <span className="ml-2 text-xs font-medium text-emerald-300">{signed(delta)}</span> : null}
      </dd>
      {hint ? <dd className="mt-0.5 text-[11px] leading-4 text-zinc-500">{hint}</dd> : null}
    </div>
  );
}

function WaterfallRow({ row, delta, strong = false }: { row: PlanRow; delta?: number; strong?: boolean }) {
  const negative = row.kind === "deduction" || row.kind === "tax" || row.kind === "commitment";
  const isResult = row.kind === "result";
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:grid-cols-[minmax(0,1fr)_110px_100px_72px]",
        strong && "bg-zinc-50 font-medium dark:bg-zinc-900/60",
        isResult && "bg-emerald-50 dark:bg-emerald-950/30",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn(isResult && "font-semibold")}>{row.label}</span>
          {delta ? (
            <span className="rounded-full border border-zinc-300 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
              {signed(delta)}
            </span>
          ) : null}
        </div>
        {row.note ? <p className="mt-0.5 text-xs text-zinc-500">{row.note}</p> : null}
      </div>
      <span className={cn("text-right text-sm tabular-nums", row.annual < 0 && "text-red-700 dark:text-red-400")}>
        {negative ? "− " : ""}{formatCurrency(Math.abs(row.annual))}
      </span>
      <span className="hidden text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-300 sm:block">
        {negative ? "− " : ""}{formatCurrency(Math.abs(row.monthly))}
      </span>
      <span className="hidden text-right text-xs tabular-nums text-zinc-500 sm:block">
        {formatPercent(Math.abs(row.pctOfComp))}
      </span>
      <span className="col-span-2 text-xs text-zinc-500 sm:hidden">
        {formatCurrency(Math.abs(row.monthly))}/mo · {formatPercent(Math.abs(row.pctOfComp))} of comp
      </span>
    </div>
  );
}
