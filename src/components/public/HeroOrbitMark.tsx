/**
 * A thin arc with a single dot riding along it, tucked behind the hero's headline.
 *
 * Ties to the one promise the page keeps repeating — "we check the real calendar, not a guess" —
 * as a small piece of motion rather than another static line. The arc itself draws in once with
 * the same technique as the other hero marks; only the dot keeps moving, back and forth along the
 * arc rather than looping, since it is a partial ring and snapping back to the start would read as
 * a glitch. Purely decorative, so it is hidden from screen readers, and the page's global
 * prefers-reduced-motion rule (see globals.css) freezes both the draw-in and the dot.
 */
const ARC_PATH = "M8,86 A78,78 0 0,1 118,10";

export function HeroOrbitMark() {
  return (
    <svg
      viewBox="0 0 130 100"
      aria-hidden
      className="pointer-events-none absolute -left-4 -top-6 hidden h-28 w-36 sm:block"
    >
      <path
        d={ARC_PATH}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
        className="animate-draw-line-slow"
      />
      <circle
        r="3.5"
        fill="var(--color-primary)"
        className="animate-orbit-dot"
        style={{ offsetPath: `path("${ARC_PATH}")`, animationDelay: "1.6s" }}
      />
    </svg>
  );
}
