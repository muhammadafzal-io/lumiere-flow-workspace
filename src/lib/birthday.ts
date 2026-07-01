const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_MONTH_DAY = /^\d{2}-\d{2}$/;

/** Parse month/day from YYYY-MM-DD or legacy MM-DD. */
export function parseBirthdayMonthDay(raw: string): { month: number; day: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (ISO_DATE.test(trimmed)) {
    const [, month, day] = trimmed.split("-").map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { month, day };
  }

  if (LEGACY_MONTH_DAY.test(trimmed)) {
    const [month, day] = trimmed.split("-").map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { month, day };
  }

  return null;
}

/** Store birthdays as YYYY-MM-DD (Chicago calendar date). Upgrades legacy MM-DD to 2000-MM-DD. */
export function normalizeBirthdayForStorage(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim();

  if (ISO_DATE.test(trimmed)) return trimmed;

  if (LEGACY_MONTH_DAY.test(trimmed)) return `2000-${trimmed}`;

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  }

  return undefined;
}

/** Value for HTML date inputs. */
export function birthdayToInputValue(stored: string | undefined): string {
  if (!stored?.trim()) return "";
  const trimmed = stored.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  if (LEGACY_MONTH_DAY.test(trimmed)) return `2000-${trimmed}`;
  return normalizeBirthdayForStorage(trimmed) ?? "";
}

export function isValidBirthdayInput(raw: string | undefined): boolean {
  return !!normalizeBirthdayForStorage(raw);
}

export function formatBirthdayDisplay(stored: string | undefined): string {
  if (!stored?.trim()) return "";
  const inputValue = birthdayToInputValue(stored);
  if (!inputValue) return stored;
  const date = new Date(`${inputValue}T12:00:00`);
  if (isNaN(date.getTime())) return stored;
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
