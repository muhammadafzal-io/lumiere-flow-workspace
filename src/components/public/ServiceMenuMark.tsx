"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's visual: the clinic's actual treatment menu, drawn rather than photographed.
 *
 * Every row is a real service read from the clinic's own records at request time — the same
 * source the Treatments index further down the page uses — so this mark can never advertise a
 * treatment that isn't offered. Nothing here is a stock illustration or a screenshot of a real
 * client's record.
 *
 * The glyphs are deliberately abstract line marks rather than literal icons (no syringes, no
 * faces, no lasers pointed at anyone), matching the language the rest of the page already uses
 * for its botanical accent and practitioner silhouette. A soft highlight drifts down the list
 * every few seconds so the hero keeps a pulse instead of freezing after its entrance — stopped
 * entirely under prefers-reduced-motion, and paused while the tab is in the background.
 */

const PAD = 20;
const RIGHT = 340;
const ROW_TOP = 78;
const ROW_H = 62;
const MAX_ROWS = 5;

const HIGHLIGHT_INTERVAL_MS = 3500;
// Lets the staggered row entrance finish before the highlight starts wandering.
const HIGHLIGHT_START_MS = 2400;

export interface ServiceRow {
  name: string;
  durationMinutes: number;
  price: number | null;
}

interface GlyphProps {
  x: number;
  y: number;
}

/** Injectables — three precise points under a steady arc. */
function GlyphPrecision({ x, y }: GlyphProps) {
  return (
    <g stroke="var(--color-primary)" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <path d={`M${x - 10},${y + 7} A 12,12 0 0 1 ${x + 10},${y + 7}`} opacity="0.75" />
      <circle cx={x - 5} cy={y + 1} r="1.7" fill="var(--color-primary)" stroke="none" />
      <circle cx={x} cy={y - 2} r="1.7" fill="var(--color-primary)" stroke="none" />
      <circle cx={x + 5} cy={y + 1} r="1.7" fill="var(--color-primary)" stroke="none" />
    </g>
  );
}

/** Light-based treatments — rays converging on a single point. */
function GlyphLight({ x, y }: GlyphProps) {
  return (
    <g stroke="var(--color-primary)" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <path d={`M${x - 9},${y - 9} L${x - 2},${y + 1}`} />
      <path d={`M${x},${y - 12} L${x},${y + 1}`} opacity="0.7" />
      <path d={`M${x + 9},${y - 9} L${x + 2},${y + 1}`} />
      <circle cx={x} cy={y + 6} r="3.2" />
    </g>
  );
}

/** Hydration and glow — a single closed droplet contour. */
function GlyphHydration({ x, y }: GlyphProps) {
  return (
    <g stroke="var(--color-primary)" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <path
        d={`M${x},${y - 11} C${x + 9},${y - 2} ${x + 8},${y + 9} ${x},${y + 10} C${x - 8},${y + 9} ${x - 9},${y - 2} ${x},${y - 11} Z`}
      />
      <path d={`M${x - 3.5},${y + 3} A 4.5,4.5 0 0 0 ${x + 2},${y + 5.5}`} opacity="0.55" />
    </g>
  );
}

/** Resurfacing and texture work — an even field of fine points. */
function GlyphTexture({ x, y }: GlyphProps) {
  const dots: [number, number][] = [];
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) dots.push([x + col * 7, y + row * 7]);
  }
  return (
    <g fill="var(--color-primary)">
      {dots.map(([dx, dy], i) => (
        <circle key={i} cx={dx} cy={dy} r="1.6" opacity={i % 2 === 0 ? 0.9 : 0.45} />
      ))}
    </g>
  );
}

/** Contouring and lifting — a line finding a new shape. */
function GlyphContour({ x, y }: GlyphProps) {
  return (
    <g stroke="var(--color-primary)" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <path d={`M${x - 10},${y + 9} C${x - 4},${y + 2} ${x - 2},${y - 6} ${x + 8},${y - 9}`} />
      <path
        d={`M${x - 9},${y + 12} C${x - 2},${y + 5} ${x + 1},${y - 2} ${x + 11},${y - 5}`}
        opacity="0.35"
      />
      <circle cx={x + 8} cy={y - 9} r="2.3" fill="var(--color-primary)" stroke="none" />
    </g>
  );
}

function GlyphDefault({ x, y }: GlyphProps) {
  return (
    <g stroke="var(--color-primary)" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <circle cx={x} cy={y - 3} r="6.5" />
      <path d={`M${x},${y + 4} L${x},${y + 11}`} opacity="0.55" />
    </g>
  );
}

/** Picks a mark from the service's own name, so a clinic renaming a treatment still gets a
 * sensible glyph without anyone editing a lookup table by hand. */
function glyphFor(name: string): (props: GlyphProps) => React.JSX.Element {
  const n = name.toLowerCase();
  if (/botox|filler|inject|dysport|tox|lip/.test(n)) return GlyphPrecision;
  if (/laser|ipl|light|photo/.test(n)) return GlyphLight;
  if (/facial|hydra|glow|peel|hydration|fresh/.test(n)) return GlyphHydration;
  if (/needl|resurfac|texture|micro|derma/.test(n)) return GlyphTexture;
  if (/neck|lift|sculpt|body|contour|jaw|chin/.test(n)) return GlyphContour;
  return GlyphDefault;
}

function metaFor(service: ServiceRow): string {
  const duration = `${service.durationMinutes} min`;
  return service.price != null
    ? `${duration} · $${service.price}`
    : `${duration} · on consultation`;
}

export function ServiceMenuMark({
  services,
  clinicName,
}: {
  services: ServiceRow[];
  clinicName: string;
}) {
  const rows = services.slice(0, MAX_ROWS);
  const [active, setActive] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (rows.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = setTimeout(() => {
      setActive(0);
      intervalRef.current = setInterval(() => {
        // Nothing to watch in a background tab — it picks up again on return.
        if (document.hidden) return;
        setActive((i) => ((i ?? -1) + 1) % rows.length);
      }, HIGHLIGHT_INTERVAL_MS);
    }, HIGHLIGHT_START_MS);

    return () => {
      clearTimeout(start);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rows.length]);

  return (
    <svg
      viewBox="0 0 360 440"
      role="img"
      aria-label={`Illustration of the treatments offered at ${clinicName}`}
      className="h-full w-full"
    >
      <rect width="360" height="440" fill="#ffffff" />

      {/* The same quiet botanical line the rest of the hero family carries — abstract, drawn
          once, never looping. */}
      <path
        d="M300 20 C 320 32, 330 50, 322 70 C 340 64, 352 72, 352 88"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
        className="animate-draw-line"
      />

      <text
        x={PAD}
        y="36"
        fontSize="17"
        fontWeight="500"
        fill="var(--color-foreground)"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Treatments
      </text>
      <text
        x={RIGHT}
        y="36"
        fontSize="10"
        letterSpacing="1.4"
        textAnchor="end"
        fill="var(--color-muted-foreground)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {services.length > 0 ? `${services.length} AVAILABLE` : "BY CONSULTATION"}
      </text>
      <rect x={PAD} y="52" width={RIGHT - PAD} height="1" fill="var(--color-border)" />

      {rows.map((service, i) => {
        const top = ROW_TOP + i * ROW_H;
        const Glyph = glyphFor(service.name);
        const isActive = active === i;
        const name = service.name.length > 22 ? `${service.name.slice(0, 21)}…` : service.name;
        return (
          <g
            key={service.name}
            className="animate-block-in"
            style={{ animationDelay: `${900 + i * 120}ms` }}
          >
            {/* The drifting highlight — the row a visitor's eye is being walked to. */}
            <rect
              x={PAD - 10}
              y={top - 22}
              width={RIGHT - PAD + 20}
              height={ROW_H - 14}
              rx="10"
              fill="var(--color-accent)"
              opacity={isActive ? 1 : 0}
              style={{ transition: "opacity 600ms ease-out" }}
            />
            <Glyph x={PAD + 16} y={top - 1} />
            <text
              x={PAD + 46}
              y={top - 4}
              fontSize="13"
              fontWeight="600"
              fill="var(--color-foreground)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {name}
            </text>
            <text
              x={PAD + 46}
              y={top + 12}
              fontSize="10.5"
              fill="var(--color-muted-foreground)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {metaFor(service)}
            </text>
            {i < rows.length - 1 && (
              <rect
                x={PAD}
                y={top + ROW_H - 32}
                width={RIGHT - PAD}
                height="1"
                fill="var(--color-border)"
              />
            )}
          </g>
        );
      })}

      <rect x={PAD} y="396" width={RIGHT - PAD} height="1" fill="var(--color-border)" />
      {/* Honest, like the calendar mark's own footer: this really is read from the clinic's
          service list on every request. */}
      <circle cx={PAD + 4} cy="418" r="3" fill="var(--color-success)" className="animate-pulse" />
      <text
        x={PAD + 14}
        y="422"
        fontSize="11"
        fill="var(--color-muted-foreground)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Live from the clinic&apos;s service list
      </text>
    </svg>
  );
}
