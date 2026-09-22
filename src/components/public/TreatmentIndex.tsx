"use client";

import { useState } from "react";

export interface TreatmentRow {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  requiresConsultation: boolean;
  bookable: boolean;
}

/**
 * The treatment list as a printed index rather than a grid of cards: numbered rows separated by
 * hairlines, the name carrying the weight, the price arriving on hover.
 *
 * Chosen partly because the clinic's own data is uneven — some treatments have no price set, and
 * one isn't bookable online. A row can absorb that quietly ("on consultation"), where a price-led
 * card would advertise the gap.
 */
export function TreatmentIndex({ treatments }: { treatments: TreatmentRow[] }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <ul className="border-t border-lumiere-navy/15">
      {treatments.map((treatment, i) => {
        const hot = active === treatment.id;
        return (
          <li key={treatment.id} className="border-b border-lumiere-navy/15">
            <a
              href="#book"
              onMouseEnter={() => setActive(treatment.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(treatment.id)}
              onBlur={() => setActive(null)}
              className={`group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 px-1 py-6 transition-colors duration-300 sm:gap-8 sm:px-4 ${
                hot ? "bg-lumiere-blush/50" : ""
              }`}
            >
              <span className="font-mono text-[11px] text-lumiere-rose tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="min-w-0">
                <span className="block font-serif text-xl font-medium leading-tight tracking-[-0.02em] text-lumiere-navy sm:text-2xl">
                  {treatment.name}
                </span>
                <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-lumiere-muted">
                  {treatment.durationMinutes} min
                  {treatment.requiresConsultation && " · consultation first"}
                  {!treatment.bookable && " · by phone"}
                </span>
              </span>

              <span className="text-right">
                <span className="block whitespace-nowrap font-serif text-lg font-medium text-lumiere-navy">
                  {treatment.price != null ? `$${treatment.price}` : "On consultation"}
                </span>
                <span
                  className={`mt-1 block whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-lumiere-rose transition-all duration-300 motion-reduce:transition-none ${
                    hot ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
                  }`}
                >
                  Book →
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
