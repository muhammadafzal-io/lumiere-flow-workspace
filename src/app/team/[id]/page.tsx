import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getClinicConfig } from "@/lib/clinic-config";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import { listActiveServices } from "@/lib/booking/recipe";
import { getPractitionerById, getPractitioners } from "@/lib/integrations/airtable";
import { PublicFooter, PublicHeader, Reveal } from "@/components/public/PublicChrome";
import { FloatingBooking } from "@/components/public/BookingSection";
import { AVATARS } from "@/components/public/tones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const [clinic, practitioner] = await Promise.all([
    getClinicConfig(),
    getPractitionerById(decodeURIComponent(id)).catch(() => null),
  ]);
  if (!practitioner) return { title: `Our team — ${clinic.clinicName}` };
  return {
    title: `${practitioner.name} — ${clinic.clinicName}`,
    description: practitioner.bio?.trim() || `Meet ${practitioner.name} at ${clinic.clinicName}.`,
  };
}

/**
 * One practitioner's public profile. Everything shown — name, role, specialties, bio — is read
 * from the clinic's Practitioners table. Email and calendar ID are deliberately never rendered:
 * they're internal fields, not something to publish to every visitor.
 */
export default async function PractitionerProfilePage({ params }: Params) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const practitioner = await getPractitionerById(id).catch(() => null);
  if (!practitioner) notFound();

  const clinic = await getClinicConfig();
  const [hours, services, all] = await Promise.all([
    getClinicBusinessHours()
      .then(describeClinicHours)
      .catch(() => clinic.businessHours),
    listActiveServices().catch(() => []),
    getPractitioners().catch(() => []),
  ]);

  // Same position-based pick the team cards use, so the avatar and tint match the card clicked.
  const index = Math.max(
    0,
    all.findIndex((p) => p.id === practitioner.id),
  );
  const avatar = AVATARS[index % AVATARS.length];

  const specialties = (practitioner.specialty ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const firstName = practitioner.name.replace(/^Dr\.?\s*/i, "").split(" ")[0];
  const others = all.filter((p) => p.id !== practitioner.id);

  const clinicProps = {
    clinicName: clinic.clinicName,
    location: clinic.location,
    businessHours: hours,
    address: clinic.address,
    treatmentNames: services.map((s) => s.name),
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader clinicName={clinic.clinicName} homeHref="/" />

      <main id="main">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
          <Link
            href="/#team"
            className="group inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
            Our team
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-12">
            <Reveal className="lg:col-span-5">
              <div
                className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl ring-1 lg:aspect-square bg-primary/15 text-primary ring-primary/20`}
              >
                <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/40" />
                <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/25" />
                {/* Placeholder stock portrait — see AVATARS in tones.ts. */}
                <img
                  src={avatar}
                  alt=""
                  width={128}
                  height={128}
                  className="relative h-48 w-48 rounded-full object-cover shadow-xl ring-8 ring-white sm:h-56 sm:w-56"
                />
              </div>
            </Reveal>

            <Reveal delay={120} className="lg:col-span-7">
              {practitioner.role && (
                <div className="text-[11px] uppercase tracking-[0.2em] text-primary">
                  {practitioner.role}
                </div>
              )}
              <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.03em] text-foreground sm:text-5xl">
                {practitioner.name}
              </h1>

              {specialties.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] bg-primary/15 text-primary`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {practitioner.bio && (
                <div className="mt-8 border-t pt-8">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    About
                  </h2>
                  <p className="mt-3 max-w-[60ch] whitespace-pre-line text-lg leading-relaxed text-foreground/80">
                    {practitioner.bio.trim()}
                  </p>
                </div>
              )}

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/#book"
                  className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-8 py-4 text-sm font-medium text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-lg active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  Book with {firstName}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </Link>
                <Link
                  href="/#treatments"
                  className="rounded-full border px-8 py-4 text-center text-sm font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  See treatments
                </Link>
              </div>
            </Reveal>
          </div>

          {others.length > 0 && (
            <div className="mt-20 border-t pt-10">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Also on the team
              </h2>
              <ul className="mt-5 flex flex-wrap gap-3">
                {others.map((p) => {
                  const i = all.findIndex((x) => x.id === p.id);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/team/${encodeURIComponent(p.id)}`}
                        className="flex items-center gap-3 rounded-full border py-1.5 pl-1.5 pr-5 text-sm text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={AVATARS[i % AVATARS.length]}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                        {p.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </main>

      <PublicFooter
        clinicName={clinic.clinicName}
        address={clinic.address}
        businessHours={hours}
        homeHref="/"
      />
      <FloatingBooking {...clinicProps} />
    </div>
  );
}
