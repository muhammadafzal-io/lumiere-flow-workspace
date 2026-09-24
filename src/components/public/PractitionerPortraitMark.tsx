"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's visual: the team you'll actually sit with, and the calendar behind it, drawn rather
 * than photographed.
 *
 * We hold no photographs of this clinic's practitioners, and a stock illustration would put
 * strangers' faces on real people's work — so this stays in the same abstract-line-art family as
 * the rest of the hero (HeroOrbitMark, HeroAccentMark): two head-and-shoulders silhouettes with no
 * facial detail and no likeness, plus a small calendar glyph standing in for "we check the real
 * calendar," the same promise CalendarPreview draws literally elsewhere in the app. It reads as
 * "a team is here, and booking is real" without claiming to be any particular someone.
 *
 * The caption underneath is the honest part: real names and specialties, read from the clinic's
 * own team records, cycling slowly so the hero keeps a pulse after its entrance. Stopped entirely
 * under prefers-reduced-motion, and paused while the tab is in the background.
 */

const NAME_INTERVAL_MS = 4000;
// Lets the illustration finish drawing itself in before the caption starts changing.
const NAME_START_MS = 2600;

export interface PortraitPerson {
  name: string;
  specialty?: string;
}

// Calendar glyph, top-left — a compact card rather than a full grid, since it only needs to read
// as "a calendar" beside the team, not to be legible on its own the way CalendarPreview is.
const CAL_X = 20;
const CAL_Y = 26;
const CAL_W = 94;
const CAL_H = 80;
const CAL_DOT_COLS = [34, 56, 78, 100];
const CAL_DOT_ROWS = [66, 88];
const CAL_HIGHLIGHT = { col: 2, row: 1 }; // the "booked" cell, given a check mark instead of a dot

// Shared figure geometry (head, shoulders, collar) — reused at two scales/positions below so both
// silhouettes stay the exact same hand-tuned curve rather than two slightly different drawings.
const FIGURE_SHOULDERS = "M92 330 C 92 242, 128 202, 180 202 C 232 202, 268 242, 268 330 Z";
const FIGURE_HEAD = { cx: 180, cy: 148, r: 52 };

export function PractitionerPortraitMark({
  practitioners,
  clinicName,
}: {
  practitioners: PortraitPerson[];
  clinicName: string;
}) {
  const [index, setIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (practitioners.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        // Nothing to read in a background tab — it picks up again on return.
        if (document.hidden) return;
        setIndex((i) => (i + 1) % practitioners.length);
      }, NAME_INTERVAL_MS);
    }, NAME_START_MS);

    return () => {
      clearTimeout(start);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [practitioners.length]);

  const person = practitioners[index] ?? null;
  const specialty = person?.specialty?.split(",")[0]?.trim() ?? "";
  const initial =
    person?.name
      .replace(/^Dr\.?\s*/i, "")
      .charAt(0)
      .toUpperCase() ?? "";

  return (
    <svg
      viewBox="0 0 360 440"
      role="img"
      aria-label={`Illustration of the team and calendar at ${clinicName}`}
      className="h-full w-full"
    >
      <rect width="360" height="440" fill="#ffffff" />

      {/* A soft halo, so the group sits on something rather than floating on bare white. */}
      <circle cx="180" cy="216" r="140" fill="var(--color-accent)" opacity="0.4" />

      {/* The same quiet botanical line the rest of the hero family carries. */}
      <path
        d="M300 20 C 320 32, 330 50, 322 70 C 340 64, 352 72, 352 88"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
        className="animate-draw-line"
      />

      {/* A second, quieter figure behind and to the left — "a team," not just one person. Filled
          with the accent tint rather than near-white, so it reads as a soft body standing behind
          the front figure instead of a stray outline floating on the white card. */}
      <g
        transform="translate(30.8,130.08) scale(0.54)"
        className="animate-block-in"
        style={{ animationDelay: "1300ms" }}
      >
        <path
          d={FIGURE_SHOULDERS}
          fill="var(--color-accent)"
          stroke="var(--color-foreground)"
          strokeWidth="1.8"
          opacity="0.65"
        />
        <circle
          cx={FIGURE_HEAD.cx}
          cy={FIGURE_HEAD.cy}
          r={FIGURE_HEAD.r}
          fill="var(--color-accent)"
          stroke="var(--color-foreground)"
          strokeWidth="1.8"
          opacity="0.65"
        />
      </g>

      {/* The calendar card — two ring tabs, a header line, a week of dots, and one cell already
          booked. Abstract rather than legible, the same way the treatment glyphs elsewhere on the
          page are marks rather than screenshots. */}
      <rect
        x="38"
        y="18"
        width="6"
        height="14"
        rx="3"
        fill="var(--color-foreground)"
        opacity="0.55"
      />
      <rect
        x="90"
        y="18"
        width="6"
        height="14"
        rx="3"
        fill="var(--color-foreground)"
        opacity="0.55"
      />
      <rect
        x={CAL_X}
        y={CAL_Y}
        width={CAL_W}
        height={CAL_H}
        rx="10"
        fill="var(--color-muted)"
        stroke="var(--color-foreground)"
        strokeWidth="1.5"
        pathLength={220}
        className="animate-draw-line"
      />
      <rect x={CAL_X} y={CAL_Y + 24} width={CAL_W} height="1" fill="var(--color-border)" />
      {CAL_DOT_ROWS.map((y, row) =>
        CAL_DOT_COLS.map((x, col) => {
          if (row === CAL_HIGHLIGHT.row && col === CAL_HIGHLIGHT.col) return null;
          return <circle key={`${row}-${col}`} cx={x} cy={y} r="3" fill="var(--color-border)" />;
        }),
      )}
      <g className="animate-badge-pop" style={{ animationDelay: "2000ms" }}>
        <circle
          cx={CAL_DOT_COLS[CAL_HIGHLIGHT.col]}
          cy={CAL_DOT_ROWS[CAL_HIGHLIGHT.row]}
          r="7"
          fill="var(--color-primary)"
        />
        <path
          d={`M${CAL_DOT_COLS[CAL_HIGHLIGHT.col] - 3.2},${CAL_DOT_ROWS[CAL_HIGHLIGHT.row]} L${CAL_DOT_COLS[CAL_HIGHLIGHT.col] - 1},${CAL_DOT_ROWS[CAL_HIGHLIGHT.row] + 2.4} L${CAL_DOT_COLS[CAL_HIGHLIGHT.col] + 3.6},${CAL_DOT_ROWS[CAL_HIGHLIGHT.row] - 3}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* The foreground figure — same geometry the hero has always used, just scaled down to
          share the frame with a second person and the calendar above. */}
      <g transform="translate(96.2,127.32) scale(0.66)">
        <path
          d={FIGURE_SHOULDERS}
          fill="var(--color-muted)"
          stroke="var(--color-foreground)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          opacity="0.9"
          pathLength={220}
          className="animate-draw-line"
        />
        <circle
          cx={FIGURE_HEAD.cx}
          cy={FIGURE_HEAD.cy}
          r={FIGURE_HEAD.r}
          fill="var(--color-muted)"
          stroke="var(--color-foreground)"
          strokeWidth="1.6"
          pathLength={220}
          className="animate-draw-line"
        />
        <path
          d="M150 214 L180 246 L210 214"
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
          pathLength={220}
          className="animate-draw-line-slow"
        />
        <path
          d="M150 214 L136 300"
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
          pathLength={220}
          className="animate-draw-line-slow"
        />
        <path
          d="M210 214 L224 300"
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
          pathLength={220}
          className="animate-draw-line-slow"
        />

        {/* The one point of colour — a badge, standing in for a pinned name tag. */}
        <g className="animate-badge-pop" style={{ animationDelay: "1650ms" }}>
          <circle cx="222" cy="252" r="12" fill="var(--color-primary)" />
          <text
            x="222"
            y="257"
            fontSize="12"
            fontWeight="600"
            textAnchor="middle"
            fill="var(--color-primary-foreground)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {initial}
          </text>
        </g>
      </g>

      <rect x="20" y="364" width="320" height="1" fill="var(--color-border)" />

      <text
        x="20"
        y="388"
        fontSize="10"
        letterSpacing="1.4"
        fill="var(--color-muted-foreground)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        WHO YOU&apos;LL SEE
      </text>

      {/* Keyed on the name so each change remounts and replays the fade rather than snapping. */}
      {person && (
        <g key={person.name} className="animate-block-in">
          <text
            x="20"
            y="412"
            fontSize="15"
            fontWeight="600"
            fill="var(--color-foreground)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {person.name.length > 26 ? `${person.name.slice(0, 25)}…` : person.name}
          </text>
          {specialty && (
            <text
              x="20"
              y="430"
              fontSize="10.5"
              fill="var(--color-muted-foreground)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {specialty.length > 38 ? `${specialty.slice(0, 37)}…` : specialty}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
