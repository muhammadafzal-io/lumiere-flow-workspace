import type { Metadata } from "next";
import { getFormResponseLink } from "@/lib/forms/response-link";
import { FormFillForm } from "@/components/forms/FormFillForm";
import { getClinicConfig } from "@/lib/clinic-config";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `Complete your form — ${clinic.clinicName}` };
}

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

export default async function FillFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getFormResponseLink(token);

  if (!found) {
    return (
      <Shell>
        <MessageCard
          title="Link not found"
          body="This link is invalid. If you're trying to complete a form, please contact the clinic directly."
        />
      </Shell>
    );
  }

  const { link, form } = found;

  if (link.status === "expired") {
    return (
      <Shell>
        <MessageCard
          title="This link has expired"
          body="Please contact the clinic directly if you still need to complete this form."
        />
      </Shell>
    );
  }

  if (link.status === "completed") {
    return (
      <Shell>
        <MessageCard
          title="Thank you!"
          body="This form has already been submitted. We look forward to seeing you."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-2xl border bg-card shadow-sm p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">{form.name}</h1>
          {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
        </div>
        <FormFillForm token={token} fields={form.fields} />
      </div>
    </Shell>
  );
}
