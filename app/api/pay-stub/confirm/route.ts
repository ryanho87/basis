import { prisma } from "@/lib/prisma";
import { normalizePayStubExtraction } from "@/lib/pay-stub";
import { getCurrentUserId } from "@/lib/user";

export const runtime = "nodejs";

function noonUtc(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const body = (await request.json()) as unknown;
  const hash = body && typeof body === "object" && typeof (body as { documentHash?: unknown }).documentHash === "string"
    ? (body as { documentHash: string }).documentHash
    : "";
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return Response.json({ error: "Invalid pay-stub fingerprint" }, { status: 400 });
  }

  const value = normalizePayStubExtraction(body, hash);
  if (!value.payDate || value.ytdGrossPay === null) {
    return Response.json({ error: "Pay date and YTD gross pay are required" }, { status: 400 });
  }
  const payDate = noonUtc(value.payDate);
  const taxYear = payDate.getUTCFullYear();
  if (taxYear < 2000 || taxYear > new Date().getFullYear() + 1) {
    return Response.json({ error: "Pay date is outside the supported tax years" }, { status: 400 });
  }
  const duplicate = await prisma.w2Snapshot.findFirst({ where: { userId, documentHash: hash } });
  if (duplicate) {
    return Response.json({ error: "This pay stub has already been saved" }, { status: 409 });
  }

  const componentPretax = (value.ytdRetirement ?? 0) + (value.ytdHsa ?? 0);
  const snapshot = await prisma.w2Snapshot.create({
    data: {
      userId,
      taxYear,
      snapshotDate: payDate,
      ytdWages: value.ytdGrossPay,
      ytdFederalWithheld: value.ytdFederalWithheld ?? 0,
      ytdStateWithheld: value.ytdStateWithheld ?? 0,
      ytdSocialSecurity: value.ytdSocialSecurity ?? 0,
      ytdMedicare: value.ytdMedicare ?? 0,
      ytdBonuses: value.ytdBonuses ?? 0,
      ytdRsuVestIncome: value.ytdRsuVestIncome ?? 0,
      rsuIncomeIsExplicit: value.ytdRsuVestIncome !== null,
      source: "PAY_STUB_UPLOAD",
      employerName: value.employerName,
      stateCode: value.stateCode,
      payPeriodStart: value.payPeriodStart ? noonUtc(value.payPeriodStart) : null,
      payPeriodEnd: value.payPeriodEnd ? noonUtc(value.payPeriodEnd) : null,
      currentGrossPay: value.currentGrossPay,
      currentNetPay: value.currentNetPay,
      ytdNetPay: value.ytdNetPay,
      ytdPretaxDeductions: value.ytdPretaxDeductions ?? componentPretax,
      ytdRetirement: value.ytdRetirement ?? 0,
      ytdHsa: value.ytdHsa ?? 0,
      payFrequency: value.payFrequency,
      documentHash: hash,
      notes: "Imported from a reviewed pay stub. The original file was not stored.",
    },
    select: { id: true },
  });

  return Response.json({ snapshot });
}
