/**
 * A quiet, layered practitioner silhouette behind the hero's calendar card.
 *
 * Setmore's own hero leans on photography of a real person to make the page feel alive; we hold no
 * photographs of the clinic's actual practitioners, and a stock headshot would misrepresent someone
 * who doesn't work here. This draws the same idea — a clinician, present in the hero — as an
 * abstract line portrait instead: no face, just a head-and-shoulders silhouette in a soft collared
 * coat, so it reads as "our team is here" rather than claiming to be any specific real person. It
 * sits behind the calendar card, peeking out at one edge, purely for depth — decorative only, so it
 * is hidden from screen readers and dropped on narrower screens where there's no room to layer it.
 */
export function PractitionerHeroMark() {
  return (
    <svg
      viewBox="0 0 260 320"
      aria-hidden
      className="pointer-events-none absolute -left-6 bottom-6 hidden h-[70%] w-auto lg:block"
    >
      {/* A soft halo, echoing the botanical accent used elsewhere in the hero. */}
      <circle cx="150" cy="140" r="118" fill="var(--color-accent)" opacity="0.55" />

      {/* Head-and-shoulders bust — no facial detail, deliberately abstract. */}
      <g opacity="0.9">
        <path
          d="M60 320 C 60 230, 96 190, 150 190 C 204 190, 240 230, 240 320 Z"
          fill="var(--color-muted)"
          stroke="var(--color-foreground)"
          strokeWidth="1.5"
          opacity="0.85"
        />
        <circle
          cx="150"
          cy="128"
          r="52"
          fill="var(--color-muted)"
          stroke="var(--color-foreground)"
          strokeWidth="1.5"
        />
        {/* Coat collar */}
        <path
          d="M118 210 L 150 240 L 182 210"
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        {/* A small pin — the one point of colour, standing in for a badge or a pinned flower. */}
        <circle cx="182" cy="214" r="4" fill="var(--color-primary)" />
      </g>
    </svg>
  );
}
