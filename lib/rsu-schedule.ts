export const MAX_VESTING_MONTHS = 1200;

export type RsuGrantFormState = { error: string | null };

type VestingCadence = "MONTHLY" | "QUARTERLY" | "YEARLY";

function calendarDate(value: string, label: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return date;
}

// Keep the original day when possible, clamping to the target month's last day.
// UTC keeps date-only grant inputs stable across server time zones and DST.
function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(result);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay.getUTCDate()));
  return result;
}

export function buildRsuSchedule({
  vestStartDate, totalShares, cliffMonths, totalMonths, cadence,
}: {
  vestStartDate: Date;
  totalShares: number;
  cliffMonths: number;
  totalMonths: number;
  cadence: VestingCadence;
}) {
  if (!Number.isFinite(vestStartDate.getTime())) throw new Error("Enter a valid vesting start date.");
  if (!Number.isFinite(totalShares) || totalShares <= 0) throw new Error("Enter a total share count greater than zero.");
  if (!Number.isInteger(totalMonths) || totalMonths < 1 || totalMonths > MAX_VESTING_MONTHS) {
    throw new Error(`Enter a vesting length between 1 and ${MAX_VESTING_MONTHS} months.`);
  }
  if (!Number.isInteger(cliffMonths) || cliffMonths < 0 || cliffMonths > totalMonths) {
    throw new Error("The cliff must be between zero and the total vesting length.");
  }
  const periodMonths = cadence === "MONTHLY" ? 1 : cadence === "QUARTERLY" ? 3 : cadence === "YEARLY" ? 12 : 0;
  if (!periodMonths) throw new Error("Choose monthly, quarterly, or yearly vesting.");

  const months: number[] = cliffMonths > 0 ? [cliffMonths] : [];
  for (let month = cliffMonths + periodMonths; month < totalMonths; month += periodMonths) months.push(month);
  if (months.at(-1) !== totalMonths) months.push(totalMonths);

  let allocated = 0;
  return months.map((month) => {
    // Allocate by elapsed time, including the cliff and any final partial period.
    const cumulative = month === totalMonths ? totalShares : totalShares * (month / totalMonths);
    const shares = cumulative - allocated;
    allocated = cumulative;
    return { vestDate: addMonths(vestStartDate, month), shares, status: "PENDING" as const };
  });
}

export function parseRsuGrant(formData: FormData) {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const ticker = text("ticker").toUpperCase();
  if (!ticker || ticker.length > 32) throw new Error("Enter a stock symbol of up to 32 characters.");
  const grantDate = calendarDate(text("grantDate"), "grant date");
  const vestStartDate = text("vestStartDate") ? calendarDate(text("vestStartDate"), "vesting start date") : grantDate;
  const totalShares = Number(text("totalShares"));
  const vestEvents = buildRsuSchedule({
    vestStartDate,
    totalShares,
    cliffMonths: Number(text("cliffMonths") || "12"),
    totalMonths: Number(text("totalMonths") || "48"),
    cadence: (text("cadence") || "QUARTERLY") as VestingCadence,
  });
  return { ticker, company: text("company") || null, grantDate, totalShares, vestEvents };
}
