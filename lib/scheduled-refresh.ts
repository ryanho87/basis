export type RefreshWindow = "morning" | "market-close";

function zonedParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    values.find((part) => part.type === type)?.value ?? "";
  return { weekday: value("weekday"), hour: Number(value("hour")) % 24 };
}

export function isRefreshWindowActive(window: RefreshWindow, now: Date) {
  if (window === "morning") {
    return zonedParts(now, "America/Los_Angeles").hour === 6;
  }
  const market = zonedParts(now, "America/New_York");
  return !["Sat", "Sun"].includes(market.weekday) && market.hour === 16;
}

export function snapshotSlotFor(window: RefreshWindow) {
  return window === "morning" ? "morning" as const : "market-close" as const;
}
