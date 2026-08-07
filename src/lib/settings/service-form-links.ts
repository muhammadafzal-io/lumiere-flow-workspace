export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface NormalizedFormLink {
  label: string;
  url: string;
  sort_order: number;
}

/** Trims fields, drops empty-URL rows, and defaults a blank label to "Form N" by position. */
export function normalizeFormLinks(
  links: { label?: string; url?: string }[],
): NormalizedFormLink[] {
  return links
    .filter((l) => l && typeof l.url === "string" && l.url.trim())
    .map((l, i) => ({
      label: (l.label && l.label.trim()) || `Form ${i + 1}`,
      url: l.url!.trim(),
      sort_order: i,
    }));
}
