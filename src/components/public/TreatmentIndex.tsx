"use client";

import { Reveal } from "@/components/public/PublicChrome";

export interface TreatmentRow {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  requiresConsultation: boolean;
  bookable: boolean;
}

/**
 * The treatment list as a wrapping flex of softly tinted cards, each with its glyph, duration,
 * name and price.
 *
 * Chosen partly because the clinic's own data is uneven — some treatments have no price set, and
 * one isn't bookable online. A row can absorb that quietly ("on consultation"), where a price-led
 * card would advertise the gap.
 */

interface GlyphProps {
  className?: string;
}

/** Injectables — three precise points under a steady arc. Same abstract-mark language as the
 * rest of the hero family: no syringes, no faces, just a line and a rhythm of dots. */
function GlyphPrecision({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M6,17 A8,8 0 0 1 22,17" opacity="0.75" />
        <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="14" cy="7" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="18" cy="10" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** Light-based treatments — rays converging on a point. */
function GlyphLight({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M8,7 L13,15" />
        <path d="M14,5 L14,15" opacity="0.7" />
        <path d="M20,7 L15,15" />
        <circle cx="14" cy="20" r="3" />
      </g>
    </svg>
  );
}

/** Hydration and glow — a single closed droplet contour. */
function GlyphHydration({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M14,5 C22,15 21,23 14,24 C7,23 6,15 14,5 Z" />
        <path d="M10,17 A4,4 0 0 0 15,19.5" opacity="0.55" />
      </g>
    </svg>
  );
}

/** Resurfacing and texture work — an even field of fine points. */
function GlyphTexture({ className }: GlyphProps) {
  const dots: [number, number][] = [];
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) dots.push([14 + col * 6, 14 + row * 6]);
  }
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <g fill="currentColor">
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.5" opacity={i % 2 === 0 ? 0.9 : 0.45} />
        ))}
      </g>
    </svg>
  );
}

/** Contouring and lifting — a line finding a new shape. */
function GlyphContour({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M6,20 C10,14 12,10 21,7" />
        <path d="M7,23 C11,17 13,12 22,10" opacity="0.35" />
        <circle cx="21" cy="7" r="1.8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function GlyphDefault({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <circle cx="14" cy="11" r="6" />
        <path d="M14,19 L14,23" opacity="0.55" />
      </g>
    </svg>
  );
}

/** Picks a mark from the treatment's own name, so a clinic renaming one still gets a sensible
 * glyph without anyone editing a lookup table by hand — same rule ServiceMenuMark uses. */
function glyphFor(name: string): (props: GlyphProps) => React.JSX.Element {
  const n = name.toLowerCase();
  if (/botox|filler|inject|dysport|tox|lip/.test(n)) return GlyphPrecision;
  if (/laser|ipl|light|photo/.test(n)) return GlyphLight;
  if (/facial|hydra|glow|peel|hydration|fresh/.test(n)) return GlyphHydration;
  if (/needl|resurfac|texture|micro|derma/.test(n)) return GlyphTexture;
  if (/neck|lift|sculpt|body|contour|jaw|chin/.test(n)) return GlyphContour;
  return GlyphDefault;
}

export function TreatmentIndex({ treatments }: { treatments: TreatmentRow[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-5 lg:grid-cols-3">
      {treatments.map((treatment, i) => {
        const Glyph = glyphFor(treatment.name);
        const notes = [
          treatment.requiresConsultation && "Consultation first",
          !treatment.bookable && "By phone",
        ].filter(Boolean);
        return (
          <li key={treatment.id} className="flex">
            <Reveal delay={i * 70} className="flex w-full">
              <a
                href="#book"
                className="door-card"
                style={
                  {
                    "--door-glow": "color-mix(in oklch, var(--color-primary) 40%, white)",
                    "--door-bar": "var(--color-primary)",
                  } as React.CSSProperties
                }
              >
                <span className="door-pop">
                  <span
                    className={`flex h-16 w-16 items-center justify-center rounded-full shadow-sm ring-4 ring-white bg-primary/15 text-primary`}
                  >
                    <Glyph className="h-9 w-9" />
                  </span>
                </span>

                <span className="door-content">
                  <span className="font-serif text-lg font-medium leading-tight tracking-[-0.01em] text-foreground sm:text-xl">
                    {treatment.name}
                  </span>
                  <span className="door-desc">
                    <span className="block text-sm text-foreground/70">
                      {treatment.durationMinutes} min ·{" "}
                      {treatment.price != null ? `$${treatment.price}` : "On consultation"}
                    </span>
                    {notes.length > 0 && (
                      <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                        {notes.join(" · ")}
                      </span>
                    )}
                    <span className="mt-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-foreground">
                      Book →
                    </span>
                  </span>
                </span>

                <span aria-hidden className="door-bar" />
              </a>
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}
