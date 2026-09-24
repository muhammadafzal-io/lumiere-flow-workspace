import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getClinicConfig } from "@/lib/clinic-config";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import { listActiveServices } from "@/lib/booking/recipe";
import { getPractitioners } from "@/lib/integrations/airtable";
import { PublicFooter, PublicHeader, Reveal } from "@/components/public/PublicChrome";
import { HeroClinicCollage } from "@/components/public/HeroClinicCollage";
import { AboutSection } from "@/components/public/AboutSection";
import { NetworkLines } from "@/components/public/NetworkLines";
import { MemberPortal } from "@/components/public/MemberPortal";
import { PractitionerCard } from "@/components/public/PractitionerCard";
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

  const clinicProps = {
    clinicName: clinic.clinicName,
    location: clinic.location,
    businessHours: hours,
    address: clinic.address,
    treatmentNames: treatments.map((t) => t.name),
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader clinicName={clinic.clinicName} overlay />

      <main id="main">
        {/* ── Hero: a dark, gridded stage with the product rising into it on a device ─────── */}
        <section>
          <div className="relative overflow-hidden bg-panel text-panel-foreground">
            {/* Blueprint grid, faded out toward the edges so it reads as depth rather than a
                pattern — and a teal glow rising from the bottom, where the device sits. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.07) 1px, transparent 1px)",
                backgroundSize: "72px 72px",
                maskImage:
                  "radial-gradient(ellipse 80% 70% at 50% 35%, black 25%, transparent 80%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 80% 70% at 50% 35%, black 25%, transparent 80%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 70% 55% at 50% 100%, color-mix(in oklch, var(--color-primary) 70%, transparent), transparent 70%)",
              }}
            />
            {/* Drifting lines with nodes riding them, behind everything — the stage feels alive
                without competing with the headline. */}
            <NetworkLines className="opacity-60 lg:[mask-image:linear-gradient(to_right,transparent_8%,black_55%)]" />
            <div
              aria-hidden
              className="animate-blob-drift pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl"
            />
            <div
              aria-hidden
              className="animate-blob-drift-slow pointer-events-none absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
            />

            <div className="relative mx-auto flex max-w-6xl flex-col px-4 sm:px-6 lg:h-[640px] lg:flex-row lg:items-center lg:gap-8">
              <div className="pt-24 text-center sm:pt-32 lg:flex-1 lg:pb-8 lg:pt-20 lg:text-left">
                <Reveal>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-panel-foreground/80 backdrop-blur">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                    </span>
                    Front desk answers day or night
                  </span>
                </Reveal>

                {/* Each line sits in its own overflow-hidden box so it rises from a mask rather
                  than just fading in place — the page's biggest type earns more than a block fade. */}
                <h1 className="mx-auto mt-6 max-w-[16ch] font-serif text-[2.6rem] font-medium leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:mx-0 lg:text-[3.75rem]">
                  <span className="block overflow-hidden">
                    <span
                      className="animate-line-reveal inline-block"
                      style={{ animationDelay: "100ms" }}
                    >
                      Care that fits
                    </span>
                  </span>
                  <span className="relative inline-block">
                    <span className="block overflow-hidden text-[oklch(0.86_0.13_178)]">
                      <span
                        className="animate-line-reveal inline-block"
                        style={{ animationDelay: "180ms" }}
                      >
                        your calendar.
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 200 12"
                      preserveAspectRatio="none"
                      aria-hidden
                      className="absolute -bottom-1 left-0 h-3 w-full"
                    >
                      <path
                        d="M2,6 Q50,11 100,5 T198,7"
                        fill="none"
                        stroke="oklch(0.86 0.13 178)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        opacity="0.7"
                        className="animate-draw-line"
                        style={{ animationDelay: "520ms" }}
                      />
                    </svg>
                  </span>
                </h1>

                <Reveal delay={140}>
                  <p className="mx-auto mt-6 max-w-[46ch] leading-relaxed text-panel-foreground/70 lg:mx-0">
                    {practitioners.length > 0
                      ? `${practitioners.length} practitioners, ${treatments.length} treatments, and a front desk that answers day or night. Tell us what you'd like — we'll find the time.`
                      : "Tell us what you'd like and when. Our front desk answers day or night, and we'll find you a time."}
                  </p>
                </Reveal>

                <Reveal delay={220}>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
                    <a
                      href="#book"
                      className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-primary transition-all duration-300 hover:shadow-[0_10px_40px_-10px_rgba(255,255,255,0.5)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-panel motion-reduce:transition-none"
                    >
                      Book an appointment
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </a>
                    <a
                      href="#treatments"
                      className="rounded-full border border-white/25 px-7 py-3.5 text-center text-sm font-medium text-panel-foreground transition-colors duration-300 hover:bg-white/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
                    >
                      Treatments
                    </a>
                  </div>
                </Reveal>
              </div>

              {/* The business itself rather than a picture of the site: real team, hours and menu, read
                from the clinic's own records and floated as glass cards over the stage. */}
              <Reveal
                delay={300}
                className="relative mx-auto mt-10 w-full max-w-xl pb-14 lg:mt-0 lg:w-[50%] lg:max-w-none lg:self-center lg:pb-0 lg:pt-16"
              >
                <HeroClinicCollage
                  address={clinic.address}
                  hours={hours}
                  practitioners={practitioners.map((p) => ({
                    id: p.id,
                    name: p.name,
                    specialty: p.specialty ?? null,
                    role: p.role ?? null,
                  }))}
                  treatments={treatments.map((t) => ({ name: t.name, price: t.price }))}
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Treatments: a printed index, not a card grid ──────────────────────────────── */}
        {treatments.length > 0 && (
          <section id="treatments" className="scroll-mt-20">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
              <Reveal>
                <div className="mb-10 flex items-baseline justify-between gap-6">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-primary">Menu</div>
                    <h2 className="mt-2 font-serif text-3xl font-medium tracking-[-0.02em] text-foreground sm:text-4xl">
                      Treatments
                    </h2>
                  </div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {treatments.length} available
                  </span>
                </div>
              </Reveal>
              <Reveal delay={80}>
                <div className="orbit-panel rounded-[2rem] bg-muted/60 p-4 sm:p-10">
                  <TreatmentIndex treatments={treatments} />
                </div>
              </Reveal>
            </div>
          </section>
        )}

        <AboutSection clinicName={clinic.clinicName} location={clinic.location} />

        {/* ── Booking: the page's anchor, full-bleed and dark ───────────────────────────── */}
        <BookingBand {...clinicProps} />

        {/* ── Team: stacked rows, alternating, not three identical cards ────────────────── */}
        {practitioners.length > 0 && (
          <section id="team" className="scroll-mt-20">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
              <Reveal>
                <div className="text-[11px] uppercase tracking-[0.2em] text-primary">Our team</div>
                <h2 className="mb-10 mt-2 font-serif text-3xl font-medium tracking-[-0.02em] text-foreground sm:text-4xl">
                  Who you&apos;ll see
                </h2>
              </Reveal>
              <div className="rounded-[2rem] bg-muted/60 p-4 sm:p-10">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {practitioners.map((practitioner, i) => (
                    <PractitionerCard
                      key={practitioner.id}
                      index={i}
                      id={practitioner.id}
                      name={practitioner.name}
                      role={practitioner.role}
                      specialty={practitioner.specialty}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Closing: whitespace and one instruction ───────────────────────────────────── */}
        <MemberPortal />

        {/* ── Closing: a full-bleed brand-colour band ───── */}
        <section
          id="visit"
          className="relative isolate scroll-mt-20 overflow-hidden bg-[#031510] text-primary-foreground"
        >
          {/* The image: our own abstract teal ribbons (public/closing-bg.svg) sitting to the right,
              drifting very slowly, with a dark wash from the left so the headline stays clean —
              the same "image behind a darkened text side" idea as a photo CTA, without needing a
              photograph. */}
          <div
            aria-hidden
            className="animate-blob-drift-slow pointer-events-none absolute -inset-10 -z-20 bg-cover bg-[position:75%_center] bg-no-repeat"
            style={{ backgroundImage: "url(/closing-bg.svg)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#031510]/85 via-[#031510]/55 to-[#031510]/85 lg:bg-gradient-to-r lg:from-[#031510] lg:via-[#031510]/70 lg:to-transparent"
          />

          <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
            <div className="grid items-end gap-12 lg:grid-cols-12">
              <Reveal className="lg:col-span-8">
                <div className="text-[11px] uppercase tracking-[0.2em] text-primary-foreground/70">
                  Book your visit
                </div>
                <h2 className="mt-5 font-serif text-5xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-7xl lg:text-8xl">
                  Ready when you are.
                </h2>
                <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-primary-foreground/80 sm:text-xl">
                  Pick a treatment and a time — we&apos;ll check the calendar and confirm straight
                  away.
                </p>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a
                    href="#book"
                    className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-9 py-4.5 text-base font-medium text-primary transition-all duration-300 hover:shadow-[0_12px_40px_-10px_rgba(255,255,255,0.55)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none"
                  >
                    Book an appointment
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </a>
                  <Link
                    href="/account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/40 px-9 py-4.5 text-center text-base font-medium text-primary-foreground transition-colors duration-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none"
                  >
                    My account login
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={150} className="lg:col-span-4">
                <dl className="grid gap-3 text-sm">
                  <div className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/15 backdrop-blur-md">
                    <dt className="text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70">
                      Find us
                    </dt>
                    <dd className="mt-1.5 text-base">{clinic.address}</dd>
                  </div>
                  <div className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/15 backdrop-blur-md">
                    <dt className="text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70">
                      Opening hours
                    </dt>
                    <dd className="mt-1.5 text-base">{hours}</dd>
                  </div>
                </dl>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter clinicName={clinic.clinicName} address={clinic.address} businessHours={hours} />
      <FloatingBooking {...clinicProps} />
    </div>
  );
}
