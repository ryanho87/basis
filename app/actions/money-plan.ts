"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { parseCommitment, parseLevers, type PlanCommitmentInput } from "@/lib/money-plan";
import { resolvePlanYear } from "@/lib/money-plan-server";

export type SaveMoneyPlanState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  savedAt: string | null;
};

const MAX_COMMITMENTS = 40;

// The planner posts one JSON payload (levers + commitments + plan year) as a
// hidden form field so the same action works with or without JavaScript.
export async function saveMoneyPlan(
  _previous: SaveMoneyPlanState,
  formData: FormData,
): Promise<SaveMoneyPlanState> {
  const userId = await getCurrentUserId();
  let payload: { planYear?: unknown; levers?: unknown; commitments?: unknown };
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { status: "error", message: "Basis could not read that plan. Refresh and try again.", savedAt: null };
  }

  const existing = await prisma.moneyPlan.findUnique({ where: { userId } });
  const planYear = resolvePlanYear(
    typeof payload.planYear === "number" ? payload.planYear : null,
    existing?.planYear,
  );
  const levers = parseLevers(payload.levers);
  const incoming = Array.isArray(payload.commitments) ? payload.commitments.slice(0, MAX_COMMITMENTS) : [];
  const commitments = incoming
    .map((raw, index) => parseCommitment(raw, `new-${index}`))
    .filter((commitment): commitment is PlanCommitmentInput => commitment !== null);

  const current = await prisma.planCommitment.findMany({ where: { userId }, select: { id: true } });
  const currentIds = new Set(current.map((row) => row.id));
  const keepIds = new Set(commitments.map((c) => c.id).filter((id) => currentIds.has(id)));

  await prisma.$transaction([
    prisma.moneyPlan.upsert({
      where: { userId },
      create: { userId, planYear, assumptionsJson: JSON.stringify(levers) },
      update: { planYear, assumptionsJson: JSON.stringify(levers) },
    }),
    prisma.planCommitment.deleteMany({
      where: { userId, id: { notIn: [...keepIds] } },
    }),
    ...commitments.map((commitment, index) =>
      currentIds.has(commitment.id)
        ? prisma.planCommitment.update({
            where: { id: commitment.id },
            data: {
              name: commitment.name,
              kind: commitment.kind,
              amountMode: commitment.amountMode,
              amount: commitment.amount,
              active: commitment.active,
              sortOrder: index,
            },
          })
        : prisma.planCommitment.create({
            data: {
              userId,
              name: commitment.name,
              kind: commitment.kind,
              amountMode: commitment.amountMode,
              amount: commitment.amount,
              active: commitment.active,
              sortOrder: index,
            },
          }),
    ),
  ]);

  revalidatePath("/plan");
  revalidatePath("/");
  return {
    status: "saved",
    message: `Saved as your ${planYear} plan.`,
    savedAt: new Date().toISOString(),
  };
}
