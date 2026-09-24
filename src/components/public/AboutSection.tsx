import { ArrowRight, CalendarCheck, MessageCircle, UserCheck } from "lucide-react";
import { Reveal } from "@/components/public/PublicChrome";

/**
 * About us — who this is and how it works, in the same voice and visual language as the rest of
 * the page (tinted panel, orbiting glow, the hero's blueprint grid at a whisper).
 *
 * Every claim here is one the booking system actually keeps — times come from the live calendar,
 * bookings are matched to a practitioner qualified for the treatment, the front desk answers day
 * or night — so this is a description of how the clinic works, not marketing about it. Nothing
 * invented: no founding year, no client counts, no awards.
 */

const PILLARS = [
  {
    icon: CalendarCheck,
    title: "Real availability",
    body: "Every time you're offered comes from the live calendar, so what you see is actually free.",
  },
  {
    icon: UserCheck,
    title: "Matched to you",
    body: "Your booking goes to a practitioner qualified for the treatment you've asked for.",
  },
  {
    icon: MessageCircle,
    title: "Ask before you book",
    body: "Questions about prep or aftercare? Our front desk answers day or night.",
  },
];

export function AboutSection({ clinicName, location }: { clinicName: string; location: string }) {
  return (
    <section
      id="about"
      className="orbit-panel scroll-mt-20 border-y bg-primary/[0.05]"
      style={
        {
          "--orbit-a": "color-mix(in oklch, var(--color-primary) 22%, transparent)",
          "--orbit-b": "color-mix(in oklch, var(--color-primary) 14%, transparent)",
        } as React.CSSProperties
      }
    >
      {/* The hero's blueprint grid, faded to a whisper so the two ends of the page rhyme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--color-primary) 10%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--color-primary) 10%, transparent) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 75% 80% at 30% 40%, black 20%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 80% at 30% 40%, black 20%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary">About us</div>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.03em] text-foreground sm:text-5xl">
              Personal care, without the runaround.
            </h2>
            <p className="mt-5 max-w-[46ch] leading-relaxed text-muted-foreground">
              {clinicName} is based in {location}. We keep things simple: tell us what you&apos;d
              like, we find a time that works against the real calendar, and you meet a practitioner
              who&apos;s qualified for that treatment.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="#team"
                className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-lg active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                Meet the team
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </a>
              <a
                href="#book"
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Book an appointment
              </a>
            </div>
          </Reveal>

          <ul className="grid gap-4 lg:col-span-7">
            {PILLARS.map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <li key={pillar.title}>
                  <Reveal delay={i * 100}>
                    <div className="group flex items-start gap-5 rounded-3xl border bg-card/80 p-5 shadow-[0_1px_2px_rgba(27,42,74,0.04)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_-22px_rgba(27,42,74,0.3)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-6">
                      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
                          {pillar.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {pillar.body}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
