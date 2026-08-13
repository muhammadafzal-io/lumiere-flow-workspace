"use client";

import { useRouter } from "next/navigation";
import { FormFillForm } from "@/components/forms/FormFillForm";
import { FormResponseView } from "@/components/forms/FormResponseView";
import { CheckCheck, Hourglass, Inbox } from "lucide-react";
import type { FormField } from "@/lib/forms/types";

interface SiblingForm {
  id: string;
  formName: string;
  url: string;
  status: "PENDING" | "SUBMITTED" | "COMPLETED";
  formResponseId: string | null;
}

function StatusBadge({ status }: { status: SiblingForm["status"] }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCheck className="h-3.5 w-3.5" /> Completed
      </span>
    );
  }
  if (status === "SUBMITTED") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-info">
        <Inbox className="h-3.5 w-3.5" /> Submitted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Hourglass className="h-3.5 w-3.5" /> Pending
    </span>
  );
}

/**
 * Renders the form the emailed link was actually for, plus every other required form for the same
 * booking. All entry points (this link, a sibling's link) submit through the same FormFillForm ->
 * /api/forms/submit -> submitFormResponse() path, so there's only ever one place status can change.
 */
export function BookingFormsDashboard({
  token,
  linkId,
  linkStatus,
  form,
  answers,
  submittedAtLabel,
  requiredForms,
}: {
  token: string;
  linkId: string;
  linkStatus: "pending" | "completed" | "expired";
  form: { id: string; name: string; description: string; fields: FormField[] };
  answers: Record<string, unknown> | null;
  submittedAtLabel: string | null;
  requiredForms: SiblingForm[];
}) {
  const router = useRouter();
  const siblings = requiredForms.filter((f) => f.formResponseId !== linkId);

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="rounded-2xl border bg-card shadow-sm p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">{form.name}</h1>
          {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
        </div>

        {linkStatus === "expired" ? (
          <p className="text-sm text-center text-muted-foreground">
            This link has expired. Please contact the clinic directly if you still need to complete
            this form.
          </p>
        ) : linkStatus === "completed" ? (
          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground">
              {submittedAtLabel ? `Submitted ${submittedAtLabel}` : "Already submitted"}
            </p>
            <FormResponseView fields={form.fields} answers={answers ?? {}} />
          </div>
        ) : (
          <FormFillForm token={token} fields={form.fields} onSubmitted={() => router.refresh()} />
        )}
      </div>

      {siblings.length > 0 && (
        <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-3">
          <h2 className="text-sm font-semibold">Other required forms for this appointment</h2>
          <div className="rounded-md border divide-y">
            {siblings.map((f) => (
              <div key={f.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm min-w-0 truncate">{f.formName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={f.status} />
                  <a href={f.url} className="text-xs font-medium text-primary underline">
                    {f.status === "PENDING" ? "Fill Form" : "View"}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
