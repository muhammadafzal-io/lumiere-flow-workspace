/**
 * A practitioner's placeholder portrait in the Team section.
 *
 * We hold no photographs of the clinic's practitioners, and a stock headshot would misrepresent a
 * real person who works here — so this draws a generic silhouette (a head-and-shoulders line
 * mark) rather than anything that could be mistaken for an actual likeness, with the practitioner's
 * own initial as a small monogram badge for recognition. It replaces the same slot a real portrait
 * photo would fill later without a layout change, and each mark leans slightly on either the navy
 * or the rose accent so a row of them doesn't read as identical repeats.
 */
export function PractitionerMark({ name, index = 0 }: { name: string; index?: number }) {
  const initial =
    name
      .replace(/^Dr\.?\s*/i, "")
      .slice(0, 1)
      .toUpperCase() || "?";
  const accent = index % 2 === 0 ? "#c4a882" : "#1b2a4a";

  return (
    <div className="relative h-24 w-24 flex-shrink-0">
      <svg viewBox="0 0 96 96" role="img" aria-hidden className="h-24 w-24">
        <circle cx="48" cy="48" r="47" fill="#f5efe6" />
        <circle cx="48" cy="48" r="47" fill="none" stroke={accent} strokeWidth="1" opacity="0.4" />
        {/* Head-and-shoulders mark, clipped to the circle — generic by design. */}
        <clipPath id={`mark-clip-${initial}-${index}`}>
          <circle cx="48" cy="48" r="47" />
        </clipPath>
        <g clipPath={`url(#mark-clip-${initial}-${index})`} opacity="0.9">
          <circle cx="48" cy="40" r="15" fill="#1b2a4a" opacity="0.14" />
          <path
            d="M14 100 C 14 74, 30 62, 48 62 C 66 62, 82 74, 82 100 Z"
            fill="#1b2a4a"
            opacity="0.14"
          />
        </g>
      </svg>
      {/* Monogram badge — the one legible identifier, so the mark still reads as "this person". */}
      <span
        className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full font-serif text-sm font-medium text-white ring-2 ring-lumiere-cream"
        style={{ backgroundColor: accent }}
      >
        {initial}
      </span>
    </div>
  );
}
