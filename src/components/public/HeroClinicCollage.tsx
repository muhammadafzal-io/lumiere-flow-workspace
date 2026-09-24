import Link from "next/link";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import { AVATARS } from "@/components/public/tones";

/**
 * The hero's right-hand side: the business itself, not a picture of the website.
 *
 * Three glass cards floating over the hero's dark stage — who you'll see, where and when to come,
 * and what's on the menu — every word read from the clinic's own records (the Practitioners table,
 * Settings hours and the active services), so it can't advertise a treatment that isn't bookable
 * or a practitioner who has left. Avatars are stock placeholders until real headshots exist (see
 * AVATARS in tones.ts). Stacked on phones and tablets; layered and slightly rotated from lg up.
 */

interface CollagePractitioner {
  id: string;
  name: string;
  specialty?: string | null;
  role?: string | null;
}

interface CollageTreatment {
  name: string;
  price: number | null;
}

const CARD =
  "rounded-3xl border border-white/15 bg-white/[0.07] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur-md";
const EYEBROW = "text-[11px] uppercase tracking-[0.18em] text-white/55";

export function HeroClinicCollage({
  address,
  hours,
  practitioners,
  treatments,
}: {
  address: string;
  hours: string;
  practitioners: CollagePractitioner[];
  treatments: CollageTreatment[];
}) {
  const team = practitioners.slice(0, 3);
  const menu = treatments.slice(0, 5);
  const moreTreatments = treatments.length - menu.length;

  return (
    <div className="relative grid gap-4 lg:block lg:h-[520px]">
      {team.length > 0 && (
        <div
          className={`${CARD} animate-float lg:absolute lg:left-0 lg:top-6 lg:w-[62%] lg:-rotate-2`}
        >
          <div className="flex items-center justify-between">
            <span className={EYEBROW}>Who you&apos;ll see</span>
            <span className="flex -space-x-2" aria-hidden>
              {team.map((p, i) => (
                <img
                  key={p.id}
                  src={AVATARS[i % AVATARS.length]}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover ring-2 ring-[#0e2a23]"
                />
              ))}
            </span>
          </div>
          <ul className="mt-4 space-y-1">
            {team.map((p, i) => {
              const line =
                p.specialty
                  ?.split(",")
                  .map((s) => s.trim())
                  .find(Boolean) ||
                p.role ||
                "";
              return (
                <li key={p.id}>
                  <Link
                    href={`/team/${encodeURIComponent(p.id)}`}
                    className="group -mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <img
                      src={AVATARS[i % AVATARS.length]}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-white/70"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {p.name}
                      </span>
                      {line && (
                        <span className="block truncate text-[11px] uppercase tracking-[0.12em] text-white/55">
                          {line}
                        </span>
                      )}
                    </span>
                    <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-white/40 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white motion-reduce:transition-none" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        className={`${CARD} animate-float lg:absolute lg:right-0 lg:top-0 lg:w-[42%] lg:rotate-2`}
        style={{ animationDelay: "-1.2s" }}
      >
        <span className={EYEBROW}>Visit us</span>
        <div className="mt-3 space-y-2.5 text-sm text-white/85">
          <p className="flex gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[oklch(0.86_0.13_178)]" />
            <span>{address}</span>
          </p>
          <p className="flex gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[oklch(0.86_0.13_178)]" />
            <span>{hours}</span>
          </p>
        </div>
      </div>

      {menu.length > 0 && (
        <div
          className={`${CARD} animate-float lg:absolute lg:bottom-0 lg:right-3 lg:w-[74%] lg:-rotate-1`}
          style={{ animationDelay: "-2.4s" }}
        >
          <span className={EYEBROW}>On the menu</span>
          <ul className="mt-3 flex flex-wrap gap-2">
            {menu.map((t) => (
              <li key={t.name}>
                <a
                  href="#treatments"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {t.name}
                  {t.price != null && <span className="text-white/55">${t.price}</span>}
                </a>
              </li>
            ))}
            {moreTreatments > 0 && (
              <li>
                <a
                  href="#treatments"
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-sm text-[oklch(0.86_0.13_178)] hover:underline"
                >
                  +{moreTreatments} more
                </a>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
