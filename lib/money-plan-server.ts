import "server-only";

import { prisma } from "./prisma";
import { projectIncome } from "./finance";
import { getRsuPriceEstimates } from "./rsu-pricing";
import {
  DEFAULT_LEVERS,
  parseCommitment,
  parseLeversJson,
  type MoneyPlanBaseline,
  type PlanCommitmentInput,
  type PlanLevers,
} from "./money-plan";

export type LoadedMoneyPlan = {
  baseline: MoneyPlanBaseline;
  levers: PlanLevers;
  commitments: PlanCommitmentInput[];
  planYear: number;
  corpName: string | null;
};

const CURRENT_YEAR = () => new Date().getFullYear();

export function resolvePlanYear(requested: string | number | null | undefined, saved: number | null | undefined) {
  const current = CURRENT_YEAR();
  const candidate = typeof requested === "string" ? Number.parseInt(requested, 10) : requested;
  const year = Number.isFinite(candidate) && candidate ? Number(candidate) : (saved ?? current);
  return Math.min(current + 3, Math.max(current - 1, year));
}

// Builds the live baseline for the planner from the same records the tax and
// dashboard pages use, so the plan never disagrees with the rest of Basis.
export async function loadMoneyPlan(userId: string, requestedYear?: string | null): Promise<LoadedMoneyPlan> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      paycheckProfile: true,
      sCorpProfile: true,
      rsuGrants: { include: { vestEvents: true } },
      moneyPlan: true,
      planCommitments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  const planYear = resolvePlanYear(requestedYear, user.moneyPlan?.planYear);
  const latestW2 = await prisma.w2Snapshot.findFirst({
    where: { userId, taxYear: planYear },
    orderBy: { snapshotDate: "desc" },
  });
  const rsuPriceEstimate = await getRsuPriceEstimates(userId, user.rsuGrants.map((grant) => grant.ticker));
  const projection = projectIncome({
    taxYear: planYear,
    paycheck: user.paycheckProfile,
    sCorp: user.sCorpProfile,
    latestW2,
    rsuGrants: user.rsuGrants,
    rsuPriceEstimate,
  });

  // Pre-tax components: the paycheck profile is the plan of record; when only
  // a pay stub exists, annualize its YTD retirement and HSA lines.
  const elapsed = latestW2?.snapshotDate
    ? Math.max(1 / 365, Math.min(1, (new Date(latestW2.snapshotDate).getTime() - new Date(planYear, 0, 1).getTime()) / (365 * 24 * 60 * 60 * 1000)))
    : 1;
  const annualize = (value: number | null | undefined) => (value ?? 0) / elapsed;
  const pretax = user.paycheckProfile
    ? {
        k401Employee: user.paycheckProfile.k401Contribution ?? 0,
        hsa: user.paycheckProfile.hsaContribution ?? 0,
        other: user.paycheckProfile.otherPretax ?? 0,
      }
    : {
        k401Employee: Math.min(100_000, annualize(latestW2?.ytdRetirement)),
        hsa: Math.min(20_000, annualize(latestW2?.ytdHsa)),
        other: Math.min(100_000, Math.max(0, annualize(latestW2?.ytdPretaxDeductions) - annualize(latestW2?.ytdRetirement) - annualize(latestW2?.ytdHsa))),
      };

  const sCorp = user.sCorpProfile;
  const salaryInWages = Boolean(sCorp && (user.paycheckProfile || latestW2));
  const w2Wages = projection.projectedW2 + projection.projectedBonus;
  const rsuVestNotInWages = projection.rsuIncomeAfterSnapshot + projection.upcomingRsuIncome;

  const baseline: MoneyPlanBaseline = {
    taxYear: planYear,
    filingStatus: user.filingStatus,
    stateCode: user.state,
    w2Wages,
    rsuVestValue: projection.ytdRsuVestIncome + rsuVestNotInWages,
    rsuVestNotInWages,
    otherOrdinaryIncome: 0,
    realizedSTCG: projection.realizedSTCG,
    realizedLTCG: projection.realizedLTCG,
    pretax,
    sCorp: sCorp
      ? {
          corpName: sCorp.corpName,
          revenue: sCorp.annualRevenue,
          operatingExpenses: sCorp.operatingExpenses,
          salary: sCorp.w2SalaryFromCorp,
          retirement: sCorp.solo401kContribution ?? 0,
          salaryInWages,
        }
      : null,
    withheld: {
      federal: latestW2?.ytdFederalWithheld ?? 0,
      state: latestW2?.ytdStateWithheld ?? 0,
    },
    hasPlanRecord: Boolean(user.moneyPlan),
  };

  const levers = user.moneyPlan ? parseLeversJson(user.moneyPlan.assumptionsJson) : { ...DEFAULT_LEVERS };
  const commitments = user.planCommitments
    .map((commitment) => parseCommitment({
      id: commitment.id,
      name: commitment.name,
      kind: commitment.kind,
      amountMode: commitment.amountMode,
      amount: commitment.amount,
      active: commitment.active,
    }, commitment.id))
    .filter((commitment): commitment is PlanCommitmentInput => commitment !== null);

  return { baseline, levers, commitments, planYear, corpName: sCorp?.corpName ?? null };
}
