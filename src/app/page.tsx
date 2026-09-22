import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getClinicConfig } from "@/lib/clinic-config";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import { listActiveServices } from "@/lib/booking/recipe";
import { getPractitioners } from "@/lib/integrations/airtable";
import { findHeroImage } from "@/lib/public/hero-image";
import { PublicFooter, PublicHeader, Reveal } from "@/components/public/PublicChrome";
import { CalendarPreview } from "@/components/public/CalendarPreview";
import { PractitionerMark } from "@/components/public/PractitionerMark";
import { PractitionerHeroMark } from "@/components/public/PractitionerHeroMark";
import { HeroAccentMark } from "@/components/public/HeroAccentMark";
import { TreatmentIndex } from "@/components/public/TreatmentIndex";
import { BookingBand, FloatingBooking } from "@/components/public/BookingSection";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return {
    title: `${clinic.clinicName} — Book your appointment`,
    description: `Treatments, opening hours and online booking at ${clinic.clinicName}.`,
  };
}

/**
 * Combined years of experience, read from the practitioners' own bios rather than claimed
 * anywhere in code — if a bio doesn't mention a number, it simply isn't counted. This is the
 * honest version of the "trust strip" pattern (Setmore's stat/testimonial band): real sums from
 * real records, never a placeholder rating or a fabricated review count.
 */
function combinedYearsExperience(bios: (string | undefined)[]): number | null {
  let total = 0;
  let found = false;
  for (const bio of bios) {
    const match = bio?.match(/(\d+)\s*\+?\s*years?/i);
    if (match) {
      total += Number(match[1]);
      found = true;
    }
  }
  return found ? total : null;
}

/**
 * The clinic's public page.
 *
 * Composed section by section rather than from one repeating card pattern: an asymmetric hero, a
 * printed index of treatments, a full-bleed booking band, stacked practitioner rows. Every word of
 * content comes from the clinic's own records, so the page cannot advertise a treatment that isn't
 * bookable or a practitioner who has left.
 */
export default async function HomePage() {
  const clinic = await getClinicConfig();
  const [hours, services, practitioners] = await Promise.all([
    getClinicBusinessHours()
      .then(describeClinicHours)
      .catch(() => clinic.businessHours),
    listActiveServices().catch(() => []),
    getPractitioners().catch(() => []),
  ]);

  const treatments = services.map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    price: s.price,
    requiresConsultation: s.requiresConsultation,
    bookable: s.onlineBookable,
  }));

  const heroImage = findHeroImage();
  const combinedYears = combinedYearsExperience(practitioners.map((p) => p.bio));
  const clinicProps = {
    clinicName: clinic.clinicName,
    location: clinic.location,
    businessHours: hours,
    address: clinic.address,
  };

  return (
    <div className="min-h-screen bg-lumiere-cream">
      <PublicHeader clinicName={clinic.clinicName} />

      {/* ── Hero: asymmetric, type-led, no card and no gradient ───────────────────────── */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 border-b border-lumiere-navy/15 py-14 lg:grid-cols-12 lg:gap-8 lg:py-24">
            <div className="lg:col-span-7">
              <Reveal>
                {/* Kept to two beats on purpose — address and hours live further down (Visit us,
                    and the footer), so the headline doesn't need to carry them too. */}
                <h1 className="font-serif text-[2.75rem] font-medium leading-[1.05] tracking-[-0.035em] text-lumiere-navy sm:text-5xl lg:text-[4.25rem]">
                  Care that fits
                  <span className="block text-lumiere-rose">your calendar.</span>
                </h1>
              </Reveal>

              <Reveal delay={140}>
                <p className="mt-8 max-w-[44ch] leading-relaxed text-lumiere-navy/75">
                  {practitioners.length > 0
                    ? `${practitioners.length} practitioners, ${treatments.length} treatments, and a front desk that answers day or night. Tell us what you'd like — we'll find the time.`
                    : "Tell us what you'd like and when. Our front desk answers day or night, and we'll find you a time."}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="#book"
                    className="rounded-full bg-lumiere-navy px-7 py-3.5 text-sm font-medium text-white transition-all duration-300 hover:bg-lumiere-navy-light hover:shadow-lg motion-reduce:transition-none"
                  >
                    Book an appointment
                  </a>
                  <a
                    href="#treatments"
                    className="rounded-full border border-lumiere-navy/20 px-7 py-3.5 text-sm font-medium text-lumiere-navy transition-colors hover:border-lumiere-navy/50"
                  >
                    Treatments
                  </a>
                </div>
              </Reveal>

              {/* Fills the open ground under the buttons on wider screens rather than leaving it
                  blank — a quiet botanical line, the same restrained "one spa gesture" language as
                  the calendar card's own accent line and the practitioner silhouette. */}
              <HeroAccentMark />
            </div>

            <Reveal delay={220} className="relative lg:col-span-5">
              {/* A quiet practitioner silhouette peeking from behind the card — depth, not a stock
                  photo of someone who doesn't work here. Desktop only; there's no room to layer it
                  once the hero stacks to one column. */}
              <PractitionerHeroMark />

              {/* Deliberately tall and tight: a portrait crop beside the headline reads as
                  editorial, where a full-width banner would read as a stock hero. A real clinic
                  photo (public/hero.jpg) always wins when one exists; until then, an SVG drawn in
                  our own booking UI's pattern — day chips, accent-bar appointment rows — stands in
                  for it, never a screenshot of the real calendar or account pages, both of which
                  show actual clients' names and numbers. */}
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] bg-white shadow-[0_20px_50px_-24px_rgba(27,42,74,0.35)] ring-1 ring-lumiere-navy/5 sm:aspect-[3/2] lg:aspect-[4/5]">
                {heroImage ? (
                  <Image
                    src={heroImage}
                    alt={`Inside ${clinic.clinicName}`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <CalendarPreview
                    treatments={treatments.map((t) => t.name)}
                    clinicName={clinic.clinicName}
                  />
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Credentials: one honest line, no star ratings or invented counts ──────────── */}
      {(combinedYears || treatments.length > 0 || practitioners.length > 0) && (
        <section className="border-b border-lumiere-navy/15">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <Reveal>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-lumiere-navy/60">
                {combinedYears && <span>{combinedYears}+ years combined experience</span>}
                {practitioners.length > 0 && (
                  <span>
                    {practitioners.length} practitioner{practitioners.length === 1 ? "" : "s"}
                  </span>
                )}
                {treatments.length > 0 && (
                  <span>
                    {treatments.length} treatment{treatments.length === 1 ? "" : "s"}
                  </span>
                )}
                {clinic.googleReviewUrl && (
                  <a
                    href={clinic.googleReviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lumiere-navy underline decoration-lumiere-rose underline-offset-4 transition-opacity hover:opacity-70"
                  >
                    Read our reviews on Google
                  </a>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Treatments: a printed index, not a card grid ──────────────────────────────── */}
      {treatments.length > 0 && (
        <section id="treatments" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <div className="mb-10 flex items-baseline justify-between gap-6">
                <h2 className="font-serif text-3xl font-medium tracking-[-0.02em] text-lumiere-navy sm:text-4xl">
                  Treatments
                </h2>
                <span className="text-[11px] uppercase tracking-[0.18em] text-lumiere-muted">
                  {treatments.length} available
                </span>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <TreatmentIndex treatments={treatments} />
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Booking: the page's anchor, full-bleed and dark ───────────────────────────── */}
      <BookingBand {...clinicProps} />

      {/* ── Team: stacked rows, alternating, not three identical cards ────────────────── */}
      {practitioners.length > 0 && (
        <section id="team" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="mb-10 font-serif text-3xl font-medium tracking-[-0.02em] text-lumiere-navy sm:text-4xl">
                Who you&apos;ll see
              </h2>
            </Reveal>
            <div className="space-y-px">
              {practitioners.map((practitioner, i) => {
                const specialties = (practitioner.specialty ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 4);
                return (
                  <Reveal key={practitioner.id} delay={i * 90}>
                    <article
                      className={`grid items-start gap-6 border-t border-lumiere-navy/15 py-10 sm:grid-cols-12 ${
                        i % 2 === 1 ? "sm:[&>*:first-child]:order-2" : ""
                      }`}
                    >
                      <div className="sm:col-span-4">
                        <PractitionerMark name={practitioner.name} index={i} />
                      </div>
                      <div className="sm:col-span-8">
                        <h3 className="font-serif text-2xl font-medium tracking-[-0.02em] text-lumiere-navy">
                          {practitioner.name}
                        </h3>
                        {practitioner.bio && (
                          <p className="mt-3 max-w-[52ch] leading-relaxed text-lumiere-navy/75">
                            {practitioner.bio.trim()}
                          </p>
                        )}
                        {specialties.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                            {specialties.map((specialty) => (
                              <span
                                key={specialty}
                                className="text-[11px] uppercase tracking-[0.14em] text-lumiere-muted"
                              >
                                {specialty}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Closing: whitespace and one instruction ───────────────────────────────────── */}
      <section id="visit" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <Reveal>
            <h2 className="mx-auto max-w-[18ch] font-serif text-4xl font-medium leading-[1.1] tracking-[-0.03em] text-lumiere-navy sm:text-5xl">
              Ready when you are.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="#book"
                className="rounded-full bg-lumiere-navy px-8 py-4 text-sm font-medium text-white transition-all duration-300 hover:bg-lumiere-navy-light hover:shadow-lg motion-reduce:transition-none"
              >
                Book an appointment
              </a>
              <Link
                href="/account"
                className="rounded-full bg-lumiere-navy-light px-8 py-4 text-sm font-medium text-white transition-all duration-300 hover:bg-lumiere-navy hover:shadow-lg motion-reduce:transition-none"
              >
                My account login
              </Link>
            </div>
            <p className="mt-8 text-sm text-lumiere-muted">
              {clinic.address} · {hours}
            </p>
          </Reveal>
        </div>
      </section>

      <PublicFooter clinicName={clinic.clinicName} address={clinic.address} businessHours={hours} />
      <FloatingBooking {...clinicProps} />
    </div>
  );
}
