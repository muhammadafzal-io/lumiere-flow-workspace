import type { Metadata } from "next";
import { getBookingFormsDashboard } from "@/lib/forms/response-link";
import { BookingFormsDashboard } from "@/components/forms/BookingFormsDashboard";
import { getClinicConfig, getClinicTimezone } from "@/lib/clinic-config";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `Complete your form — ${clinic.clinicName}` };
}

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 px-4 py-10">
      {children}
    </div>
  );
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="w-full max-w-md rounded-2xl border bg-card shadow-sm p-8 text-center space-y-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function FillFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dashboard = await getBookingFormsDashboard(token);

  if (!dashboard) {
    return (
      <Shell>
        <MessageCard
          title="Link not found"
          body="This link is invalid. If you're trying to complete a form, please contact the clinic directly."
        />
      </Shell>
    );
  }

  const { link, form, answers, submittedAt, requiredForms, booking } = dashboard;

  // Formatted server-side, in the clinic's own timezone, so the exact same string is used for
  // both the SSR pass and the client hydration pass — computing this client-side with
  // toLocaleString() would mismatch whenever the server and the customer's browser sit in
  // different timezones, breaking hydration.
  const submittedAtLabel = submittedAt ? await formatInClinicTimezone(submittedAt) : null;
  const bookingTimeLabel = booking?.startTime
    ? await formatInClinicTimezone(booking.startTime)
    : null;

  return (
    <Shell>
      <BookingFormsDashboard
        token={token}
        linkId={link.id}
        linkStatus={link.status}
        form={form}
        answers={answers}
        submittedAtLabel={submittedAtLabel}
        requiredForms={requiredForms}
        booking={booking}
        bookingTimeLabel={bookingTimeLabel}
      />
    </Shell>
  );
}

async function formatInClinicTimezone(iso: string): Promise<string> {
  const timeZone = await getClinicTimezone();
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
