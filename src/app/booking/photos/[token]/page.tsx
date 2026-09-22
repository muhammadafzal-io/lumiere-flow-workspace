import type { Metadata } from "next";
import { getPhotoRequestByToken } from "@/lib/booking/photos";
import { photoInstructions } from "@/lib/booking/photo-rules";
import { getClinicConfig } from "@/lib/clinic-config";
import { BookingPhotoUpload } from "@/components/booking/BookingPhotoUpload";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `Add your photo — ${clinic.clinicName}` };
}

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-lumiere-cream px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-lumiere-ivory bg-white shadow-sm p-8 text-center space-y-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function BookingPhotoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getPhotoRequestByToken(token).catch(() => null);

  if (!found) {
    return (
      <Shell>
        <MessageCard
          title="This link isn't valid"
          body="Please check the link in your confirmation email, or contact the clinic and we'll send you a new one."
        />
      </Shell>
    );
  }

  const { request } = found;
  if (request.status === "CANCELLED") {
    return (
      <Shell>
        <MessageCard
          title="This appointment was cancelled"
          body="There's nothing to upload. Contact the clinic if you'd like to rebook."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <BookingPhotoUpload
        token={token}
        serviceName={request.serviceName}
        requirement={request.requirement}
        instructions={photoInstructions(request.instructions, request.serviceName)}
      />
    </Shell>
  );
}
