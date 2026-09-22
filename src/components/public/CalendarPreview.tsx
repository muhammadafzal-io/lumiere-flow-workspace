/**
 * The hero's visual when no real clinic photograph has been added (see hero-image.ts).
 *
 * Drawn to match our own calendar's real visual language — the week grid, the hour gutter, the
 * colour-coded, rounded appointment blocks — cropped to three days the way a screenshot would be
 * cropped to fit this frame. It is not an actual screenshot: the real calendar shows clients' real
 * names, and publishing that on the public page would leak private data to every visitor. So the
 * grid, colours and "synced with Google Calendar" line are real; the day, times and the treatment
 * a slot is booked for are illustrative placeholders drawn from the clinic's real service names,
 * the same way any product screenshot on a marketing site is a representative example rather than
 * a live feed.
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

  const slots: Slot[] = [
    { col: 0, row: 0, color: "violet", time: "9:00" },
    { col: 0, row: 4, color: "coral", time: "1:00" },
    { col: 2, row: 0, color: "emerald", time: "9:00", extra: 2 },
    { col: 2, row: 2, color: "violet", time: "11:00" },
  ];

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
        stroke="#c4a882"
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
        fill="#1b2a4a"
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
              fill="#8a8a8a"
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
              fill="#1b2a4a"
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
        fill="#f5efe6"
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
              fill="#8a8a8a"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {h}
            </text>
            <rect x={COL_X[0]} y={y} width={RIGHT_EDGE - COL_X[0]} height="1" fill="#f5efe6" />
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
          fill="#f5efe6"
        />
      ))}

      {/* Appointment blocks — the rounded, colour-coded chips real bookings render as. Each pops
          in on its own beat, like the week filling up, rather than appearing all at once. */}
      {slots.map((slot, i) => {
        const palette = PALETTE[slot.color];
        const x = COL_X[slot.col] + 4;
        const y = GRID_TOP + ROW_H * slot.row + 3;
        const w = COL_W - 8;
        const h = ROW_H - 6;
        const blockDelay = 980 + i * 130;
        return (
          <g key={i} className="animate-block-in" style={{ animationDelay: `${blockDelay}ms` }}>
            <rect x={x} y={y} width={w} height={h} rx="8" fill={palette.bg} />
            <rect x={x} y={y} width="3" height={h} rx="1.5" fill={palette.bar} />
            <text
              x={x + 9}
              y={y + 14}
              fontSize="8.5"
              fontWeight="600"
              fill="#1b2a4a"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {slot.time}
            </text>
            <text
              x={x + 9}
              y={y + 27}
              fontSize="8.5"
              fill="#1b2a4a"
              opacity="0.75"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {label(i).length > 12 ? `${label(i).slice(0, 11)}…` : label(i)}
            </text>
            {slot.extra && (
              <g className="animate-badge-pop" style={{ animationDelay: `${blockDelay + 250}ms` }}>
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
      })}

      <rect x={GUTTER_X} y="396" width={RIGHT_EDGE - GUTTER_X} height="1" fill="#f5efe6" />
      {/* The one continuous motion in the mark — a soft breathing pulse, the same "live" convention
          the widget's own status dot already uses, and honest: the sync really is live. */}
      <circle cx={GUTTER_X + 4} cy="418" r="3" fill="#4fa97c" className="animate-pulse" />
      <text
        x={GUTTER_X + 14}
        y="422"
        fontSize="11"
        fill="#8a8a8a"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Synced with Google Calendar
      </text>
    </svg>
  );
}
