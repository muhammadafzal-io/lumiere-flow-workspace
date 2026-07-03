const TIMEZONE = "America/Chicago";

export function todayInChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** YYYY-MM-DD for an instant in Austin clinic time. */
export function chicagoDateFromIso(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** HH:mm (24h) in Austin clinic time — used to match spoken times to calendar slots. */
export function chicagoTimeKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function chicagoHour(iso: string): number {
  return Number(chicagoTimeKey(iso).split(":")[0] ?? 0);
}

export function isSundayChicagoFromIso(iso: string): boolean {
  return (
    new Date(iso).toLocaleDateString("en-US", { timeZone: TIMEZONE, weekday: "short" }) === "Sun"
  );
}

export function addChicagoDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isSundayChicago(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 0;
}

/** Next calendar day that is not Sunday (starts from dateStr). */
export function nextOpenChicagoDay(dateStr: string): string {
  let d = dateStr;
  for (let i = 0; i < 8; i++) {
    if (!isSundayChicago(d)) return d;
    d = addChicagoDays(d, 1);
  }
  return d;
}

export function tomorrowInChicago(): string {
  return addChicagoDays(todayInChicago(), 1);
}
