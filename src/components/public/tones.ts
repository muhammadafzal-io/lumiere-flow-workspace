/** The tint set shared by the treatment and team cards, so the two sections read as one family. */
export const TONES = [
  {
    card: "bg-emerald-50 hover:bg-emerald-100/70",
    chip: "bg-emerald-100 text-emerald-700",
    ring: "ring-emerald-200/70",
    glow: "oklch(0.905 0.093 164)",
    bar: "oklch(0.696 0.17 162)",
  },
  {
    card: "bg-violet-50 hover:bg-violet-100/70",
    chip: "bg-violet-100 text-violet-700",
    ring: "ring-violet-200/70",
    glow: "oklch(0.894 0.057 293)",
    bar: "oklch(0.702 0.183 293)",
  },
  {
    card: "bg-rose-50 hover:bg-rose-100/70",
    chip: "bg-rose-100 text-rose-700",
    ring: "ring-rose-200/70",
    glow: "oklch(0.892 0.058 10)",
    bar: "oklch(0.712 0.194 13)",
  },
  {
    card: "bg-amber-50 hover:bg-amber-100/70",
    chip: "bg-amber-100 text-amber-700",
    ring: "ring-amber-200/70",
    glow: "oklch(0.924 0.12 95)",
    bar: "oklch(0.828 0.189 84)",
  },
  {
    card: "bg-sky-50 hover:bg-sky-100/70",
    chip: "bg-sky-100 text-sky-700",
    ring: "ring-sky-200/70",
    glow: "oklch(0.901 0.058 231)",
    bar: "oklch(0.746 0.16 232)",
  },
  {
    card: "bg-teal-50 hover:bg-teal-100/70",
    chip: "bg-teal-100 text-teal-700",
    ring: "ring-teal-200/70",
    glow: "oklch(0.91 0.096 181)",
    bar: "oklch(0.704 0.14 182)",
  },
] as const;

/** Placeholder avatars (stock portraits, not the practitioners) until real headshots exist. Picked
 * by a practitioner's position in the active list, so a card and its profile page always agree. */
export const AVATARS = [
  "/team/women-44.jpg",
  "/team/men-32.jpg",
  "/team/men-75.jpg",
  "/team/women-68.jpg",
  "/team/men-46.jpg",
  "/team/women-26.jpg",
];

/** A practitioner's tint, derived from their id so it never changes when the team list is
 * reordered, and the card and the profile page always agree. */
export function toneFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}
