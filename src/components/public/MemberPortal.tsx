import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Gift, User } from "lucide-react";
import { Reveal } from "@/components/public/PublicChrome";
import { TONES } from "@/components/public/tones";

/**
 * The customer portal, introduced on the public page.
 *
 * The /account area already exists — visits, history, offers and profile, behind Google sign-in —
 * but nothing on the homepage told a visitor it was there beyond a small header link. This gives
 * it a section of its own, using only what the portal really does (no promised features), in the
 * same tinted-card language as the treatments and team so the page reads as one system.
 */

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Your visits",
    body: "See what's booked and when, without digging through emails.",
  },
  {
    icon: Clock,
    title: "Your history",
    body: "Every past visit and treatment in one tidy timeline.",
  },
  {
    icon: Gift,
    title: "Offers & credits",
    body: "What's available to you right now, ready to use at your next booking.",
  },
  {
    icon: User,
    title: "Your details",
    body: "Keep your contact details current so we can always reach you.",
  },
];

export function MemberPortal() {
  return (
    <section id="account" className="orbit-panel scroll-mt-20 border-t bg-muted/30">
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary">Your account</div>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.03em] text-foreground sm:text-5xl">
              Everything about your visits, in one place.
            </h2>
            <p className="mt-5 max-w-[44ch] leading-relaxed text-muted-foreground">
              Sign in with Google to see your appointments, look back over past treatments, and
              check the offers waiting for you — no password to remember.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/account"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-8 py-4 text-sm font-medium text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-lg active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                Sign in to your account
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </div>
          </Reveal>

          <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            {FEATURES.map((feature, i) => {
              const tone = TONES[i % TONES.length];
              const Icon = feature.icon;
              return (
                <li key={feature.title} className="flex">
                  <Reveal delay={i * 90} className="flex w-full">
                    <div
                      className={`group flex w-full flex-col gap-8 rounded-3xl p-6 ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(27,42,74,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-7 ${tone.card} ${tone.ring}`}
                    >
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none ${tone.chip}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-serif text-xl font-medium tracking-[-0.02em] text-foreground">
                          {feature.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                          {feature.body}
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
