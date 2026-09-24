import Link from "next/link";
import { Reveal } from "@/components/public/PublicChrome";
import { AVATARS } from "@/components/public/tones";

/**
 * A practitioner as a card in the same family as the treatment cards: a portrait panel in the
 * brand colour on top, then just a name and one line. Bio, specialties and booking are on the
 * practitioner's own profile page.
 *
 * We hold no photographs, so the panel shows a stock placeholder avatar. A real photo would drop
 * into the same panel without a layout change.
 */
export function PractitionerCard({
  id,
  name,
  role,
  specialty,
  index,
}: {
  id: string;
  name: string;
  role?: string | null;
  specialty?: string | null;
  index: number;
}) {
  // Deliberately minimal — a name and one line. Everything else lives on the profile page.
  const headline =
    specialty
      ?.split(",")
      .map((s) => s.trim())
      .find(Boolean) ||
    role?.trim() ||
    "";

  return (
    <Reveal delay={index * 90} className="flex h-full">
      <Link
        href={`/team/${encodeURIComponent(id)}`}
        aria-label={`View ${name}'s profile`}
        className={`group flex w-full flex-col overflow-hidden rounded-3xl ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(27,42,74,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 bg-primary/[0.06] ring-primary/20 hover:bg-primary/[0.1]`}
      >
        <div className="relative h-56 overflow-hidden bg-primary/15 text-primary">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/40 transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none" />
          <div className="absolute -left-8 bottom-6 h-24 w-24 rounded-full bg-white/25" />
          {/* Placeholder avatar — a stock portrait, not the practitioner. Swap AVATARS (or pass a
              real photo per practitioner) once actual headshots exist. */}
          <img
            src={AVATARS[index % AVATARS.length]}
            alt=""
            width={128}
            height={128}
            className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover shadow-lg ring-4 ring-white transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
          />
        </div>

        <div className="flex flex-1 flex-col p-6 sm:p-7">
          <h3 className="font-serif text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground">
            {name}
          </h3>
          {headline && (
            <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {headline}
            </p>
          )}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[11px] uppercase tracking-[0.14em] text-primary">
            View profile
            <span className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none">
              →
            </span>
          </span>
        </div>
      </Link>
    </Reveal>
  );
}
