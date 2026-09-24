"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A layered accent behind the booking widget's own card — visual proof of "we check the real
 * calendar," peeking out from behind the chat the way a second card would in a stack.
 *
 * Drawn to match our own calendar's real visual language — the week grid, the hour gutter, the
 * colour-coded, rounded appointment blocks — cropped to three days the way a screenshot would be
 * cropped to fit this frame. It is not an actual screenshot: the real calendar shows clients' real
 * names, and publishing that on the public page would leak private data to every visitor. So the
 * grid, colours and "synced with Google Calendar" line are real; the day, times and the treatment
 * a slot is booked for are illustrative placeholders drawn from the clinic's real service names,
 * the same way any product screenshot on a marketing site is a representative example rather than
 * a live feed.
 *
 * After the initial week draws in, one more booking quietly lands every few seconds in the one
 * empty column — not decoration, but the mark actually demonstrating the page's own pitch ("we
 * check the real calendar, not a guess") instead of just asserting it in copy. Frozen entirely
 * under prefers-reduced-motion, same as the rest of the mark's entrance.
 */

const HOURS = ["9a", "10a", "11a", "12p", "1p", "2p"];
const GUTTER_X = 8;
const COL_X = [48, 149, 250];
const COL_W = 101;
const RIGHT_EDGE = 351;
const DAY_HEADER_TOP = 44;
const GRID_TOP = 86;
const ROW_H = (396 - GRID_TOP) / HOURS.length;

const PALETTE = {
  violet: { bg: "#efe9fb", bar: "#8b7fd1" },
  emerald: { bg: "#e3f3ea", bar: "#4fa97c" },
  coral: { bg: "#fbe9e7", bar: "#e0796b" },
} as const;

interface Slot {
  col: 0 | 1 | 2;
  row: number;
  color: keyof typeof PALETTE;
  time: string;
  extra?: number;
}

const STATIC_SLOTS: Slot[] = [
  { col: 0, row: 0, color: "violet", time: "9:00" },
  { col: 0, row: 4, color: "coral", time: "1:00" },
  { col: 2, row: 0, color: "emerald", time: "9:00", extra: 2 },
  { col: 2, row: 2, color: "violet", time: "11:00" },
];

// Column 1 (Tuesday) starts empty on purpose — it's where the live booking lands, so it never
// collides with a static slot above.
const LIVE_SLOTS: Slot[] = [
  { col: 1, row: 1, color: "coral", time: "10:00" },
  { col: 1, row: 3, color: "emerald", time: "12:00" },
  { col: 1, row: 5, color: "violet", time: "2:00" },
];

const LIVE_INTERVAL_MS = 4500;
// Comfortably after the last static block's own entrance (980ms + 3 * 130ms + its ~420ms fade).
const LIVE_START_DELAY_MS = 2200;

export function CalendarPreview({
  treatments,
  clinicName,
}: {
  treatments: string[];
  clinicName: string;
}) {
  const names =
    treatments.length > 0 ? treatments : ["Botox", "Laser", "HydraFacial", "Microneedling"];
  const label = (i: number) => names[i % names.length];

  const days = [
    { abbr: "MON", num: "3" },
    { abbr: "TUE", num: "4" },
    { abbr: "WED", num: "5" },
  ];

  const [liveIndex, setLiveIndex] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = setTimeout(() => {
      setLiveIndex(0);
      intervalRef.current = setInterval(() => {
        // A background tab doesn't need to keep cycling — it'll pick up again once visible.
        if (document.hidden) return;
        setLiveIndex((i) => ((i ?? -1) + 1) % LIVE_SLOTS.length);
      }, LIVE_INTERVAL_MS);
    }, LIVE_START_DELAY_MS);

    return () => {
      clearTimeout(start);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function renderSlot(slot: Slot, key: string, animationDelayMs: number) {
    const palette = PALETTE[slot.color];
    const x = COL_X[slot.col] + 4;
    const y = GRID_TOP + ROW_H * slot.row + 3;
    const w = COL_W - 8;
    const h = ROW_H - 6;
    const labelIndex = slot.row + slot.col; // varies the treatment name shown per slot
    return (
      <g key={key} className="animate-block-in" style={{ animationDelay: `${animationDelayMs}ms` }}>
        <rect x={x} y={y} width={w} height={h} rx="8" fill={palette.bg} />
        <rect x={x} y={y} width="3" height={h} rx="1.5" fill={palette.bar} />
        <text
          x={x + 9}
          y={y + 14}
          fontSize="8.5"
          fontWeight="600"
          fill="var(--color-foreground)"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {slot.time}
        </text>
        <text
          x={x + 9}
          y={y + 27}
          fontSize="8.5"
          fill="var(--color-foreground)"
          opacity="0.75"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {label(labelIndex).length > 12 ? `${label(labelIndex).slice(0, 11)}…` : label(labelIndex)}
        </text>
        {slot.extra && (
          <g
            className="animate-badge-pop"
            style={{ animationDelay: `${animationDelayMs + 250}ms` }}
          >
            <circle cx={x + w - 10} cy={y + 10} r="8" fill={palette.bar} />
            <text
              x={x + w - 10}
              y={y + 13}
              fontSize="8"
              fontWeight="600"
              textAnchor="middle"
              fill="#ffffff"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              +{slot.extra}
            </text>
          </g>
        )}
      </g>
    );
  }

  const liveSlot = liveIndex !== null ? LIVE_SLOTS[liveIndex] : null;

  return (
    <svg
      viewBox="0 0 360 440"
      role="img"
      aria-label={`Illustration of ${clinicName}'s weekly appointment calendar`}
      className="h-full w-full"
    >
      <rect width="360" height="440" fill="#ffffff" />

      {/* A single quiet line of botanical accent — the one nod to "spa" in the whole mark,
          kept as abstract line art rather than a literal leaf/candle/stone icon. Draws itself
          in once, timed to start as the hero's own fade-in settles — never a repeating loop. */}
      <path
        d="M300 22 C 320 34, 330 52, 322 72 C 340 66, 352 74, 352 90"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
        className="animate-draw-line"
      />

      <text
        x={GUTTER_X}
        y="30"
        fontSize="17"
        fontWeight="500"
        fill="var(--color-foreground)"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        This week
      </text>

      {/* Day headers — the same MON 3 / TUE 4 pattern the real calendar's week view uses. */}
      {days.map((d, i) => {
        const cx = COL_X[i] + COL_W / 2;
        return (
          <g key={d.abbr}>
            <text
              x={cx}
              y={DAY_HEADER_TOP + 12}
              fontSize="10"
              letterSpacing="1"
              textAnchor="middle"
              fill="var(--color-muted-foreground)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {d.abbr}
            </text>
            <text
              x={cx}
              y={DAY_HEADER_TOP + 28}
              fontSize="15"
              fontWeight="600"
              textAnchor="middle"
              fill="var(--color-foreground)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {d.num}
            </text>
          </g>
        );
      })}
      <rect
        x={GUTTER_X}
        y={DAY_HEADER_TOP + 34}
        width={RIGHT_EDGE - GUTTER_X}
        height="1"
        fill="var(--color-border)"
      />

      {/* Hour gutter + grid lines — cropped to three days, as if the rest sits past the card's edge. */}
      {HOURS.map((h, i) => {
        const y = GRID_TOP + ROW_H * i;
        return (
          <g key={h}>
            <text
              x={GUTTER_X}
              y={y + 12}
              fontSize="9"
              fill="var(--color-muted-foreground)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {h}
            </text>
            <rect
              x={COL_X[0]}
              y={y}
              width={RIGHT_EDGE - COL_X[0]}
              height="1"
              fill="var(--color-border)"
            />
          </g>
        );
      })}
      {[...COL_X, RIGHT_EDGE].map((x, i) => (
        <rect
          key={`col-${i}`}
          x={x}
          y={GRID_TOP}
          width="1"
          height={ROW_H * HOURS.length}
          fill="var(--color-border)"
        />
      ))}

      {/* Appointment blocks — the rounded, colour-coded chips real bookings render as. Each pops
          in on its own beat, like the week filling up, rather than appearing all at once. */}
      {STATIC_SLOTS.map((slot, i) => renderSlot(slot, `static-${i}`, 980 + i * 130))}

      {/* The live slot — appears once the initial week has settled in, then a new one quietly
          takes its place every few seconds, in the one column left open for it. */}
      {liveSlot && renderSlot(liveSlot, `live-${liveIndex}`, 0)}

      <rect
        x={GUTTER_X}
        y="396"
        width={RIGHT_EDGE - GUTTER_X}
        height="1"
        fill="var(--color-border)"
      />
      {/* The one continuous motion in the mark — a soft breathing pulse, the same "live" convention
          the widget's own status dot already uses, and honest: the sync really is live. */}
      <circle
        cx={GUTTER_X + 4}
        cy="418"
        r="3"
        fill="var(--color-success)"
        className="animate-pulse"
      />
      <text
        x={GUTTER_X + 14}
        y="422"
        fontSize="11"
        fill="var(--color-muted-foreground)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Synced with Google Calendar
      </text>
    </svg>
  );
}
