import type { Metadata } from "next";
import { getCompletionLink, PENDING_NAME_PLACEHOLDER } from "@/lib/booking/completion-link";
import { CompleteBookingForm } from "@/components/booking/CompleteBookingForm";
import { getClinicTimezone } from "@/lib/clinic-timezone";

export const metadata: Metadata = {
  title: "Finish your booking — Lumière Med Spa",
};

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm p-8 text-center space-y-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function CompleteBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await getCompletionLink(token);

  if (!found) {
    return (
      <Shell>
        <MessageCard
          title="Link not found"
          body="This link is invalid. If you're trying to finish a booking, please contact the clinic directly."
        />
      </Shell>
    );
  }

  const { link, booking } = found;

  if (link.status === "expired") {
    return (
      <Shell>
        <MessageCard
          title="This link has expired"
          body="Please contact the clinic directly to finish setting up your appointment."
        />
      </Shell>
    );
  }

  if (link.status === "completed") {
    return (
      <Shell>
        <MessageCard
          title="You're all set!"
          body="This booking has already been completed. We look forward to seeing you."
        />
      </Shell>
    );
  }

  // Without an explicit timeZone, toLocaleString defaults to the server process's own timezone
  // (UTC here) rather than the clinic's — showing the raw UTC hour instead of the actual local
  // appointment time (e.g. a 12:40 PM GMT+5 booking rendering as "7:40 AM").
  const timezone = await getClinicTimezone();
  const displayTime = booking.startTime
    ? new Date(booking.startTime).toLocaleString("en-US", {
        timeZone: timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  return (
    <Shell>
      <div className="rounded-2xl border bg-card shadow-sm p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">Finish setting up your appointment</h1>
          <p className="text-sm text-muted-foreground">
            {booking.treatment}
            {displayTime ? ` · ${displayTime}` : ""}
            {booking.practitionerName ? ` · with ${booking.practitionerName}` : ""}
          </p>
        </div>
        <CompleteBookingForm
          token={token}
          initialName={
            [link.clientName, booking.clientName].find(
              (n) => n && n !== PENDING_NAME_PLACEHOLDER,
            ) ?? ""
          }
        />
      </div>
    </Shell>
  );
}
