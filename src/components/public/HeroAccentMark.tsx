/**
 * A quiet botanical line drawing that fills the open ground beneath the hero's call-to-action
 * buttons. Purely decorative — the same "abstract line art, never a literal icon" language as the
 * calendar card's own accent line and the practitioner silhouette, so the three marks in the hero
 * read as one family rather than three unrelated stock-style graphics. Draws itself in once, after
 * the buttons above it have settled, and never loops.
 */
export function HeroAccentMark() {
  return (
    <svg viewBox="0 0 460 150" aria-hidden className="mt-10 hidden h-auto w-full max-w-md sm:block">
      {/* A single stem, branching twice — the same restrained "one botanical gesture" the rest of
          the page allows itself. */}
      <path
        d="M10 132 C 90 128, 150 104, 190 60 C 214 34, 250 20, 300 18"
        fill="none"
        stroke="#c4a882"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
        className="animate-draw-line-slow"
      />
      <path
        d="M96 118 C 110 96, 132 84, 158 80"
        fill="none"
        stroke="#c4a882"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
        className="animate-draw-line-slow"
        style={{ animationDelay: "180ms" }}
      />
      <path
        d="M232 40 C 246 22, 268 12, 296 10"
        fill="none"
        stroke="#c4a882"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
        className="animate-draw-line-slow"
        style={{ animationDelay: "260ms" }}
      />

      {/* Three soft leaves along the stem, and three small blooms marking where it forks — the
          only filled shapes in the mark, kept small so the line stays the point. */}
      {[
        { cx: 66, cy: 122, r: 9, rot: -18 },
        { cx: 150, cy: 92, r: 8, rot: 8 },
        { cx: 222, cy: 46, r: 8, rot: -12 },
      ].map((leaf, i) => (
        <ellipse
          key={leaf.cx}
          cx={leaf.cx}
          cy={leaf.cy}
          rx={leaf.r}
          ry={leaf.r * 0.5}
          fill="#f5e6da"
          stroke="#1b2a4a"
          strokeWidth="1"
          opacity="0.7"
          transform={`rotate(${leaf.rot} ${leaf.cx} ${leaf.cy})`}
          className="animate-badge-pop"
          style={{ animationDelay: `${420 + i * 90}ms` }}
        />
      ))}

      <circle cx="10" cy="132" r="3.5" fill="#1b2a4a" opacity="0.7" className="animate-badge-pop" />
      <circle
        cx="158"
        cy="80"
        r="3"
        fill="#c4a882"
        className="animate-badge-pop"
        style={{ animationDelay: "540ms" }}
      />
      <circle
        cx="300"
        cy="18"
        r="4"
        fill="#c4a882"
        className="animate-badge-pop"
        style={{ animationDelay: "620ms" }}
      />
      <circle
        cx="296"
        cy="10"
        r="3"
        fill="#1b2a4a"
        opacity="0.6"
        className="animate-badge-pop"
        style={{ animationDelay: "680ms" }}
      />
    </svg>
  );
}
