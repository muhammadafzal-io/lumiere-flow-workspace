const TIMEZONE = "America/Chicago";

export function todayInChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
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
