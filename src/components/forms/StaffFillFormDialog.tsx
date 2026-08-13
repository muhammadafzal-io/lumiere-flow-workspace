"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { validateFormAnswers } from "@/lib/forms/validate";
import type { FormField } from "@/lib/forms/types";

interface FormDef {
  formName: string;
  fields: FormField[];
}

/**
 * Staff "Fill on Behalf" dialog — shared between AppointmentSlideOver (booking-centric) and the
 * customer profile Forms tab (customer-centric), same fetch-on-open-by-trackingId shape as
 * FormResponseDialog. Lets staff enter a client's answers themselves (e.g. the client filled the
 * form out on paper in person) through the same FormRenderer the client-facing FormFillForm
 * already uses, just posting to the staff-only /fill route instead of the token-based one.
 */
export function StaffFillFormDialog({
  trackingId,
  onClose,
  onSubmitted,
}: {
  trackingId: string | null;
  onClose: () => void;
  onSubmitted: (trackingId: string, submittedAt: string) => void;
}) {
  const [form, setForm] = useState<FormDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackingId) return;
    setForm(null);
    setAnswers({});
    setErrors({});
    setSubmitError(null);
    setLoadError(null);
    setLoading(true);
    fetch(`/api/required-forms/${trackingId}/fill`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load form");
        setForm(body);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load form"))
      .finally(() => setLoading(false));
  }, [trackingId]);

  const submit = async () => {
    if (!trackingId || !form) return;
    setSubmitError(null);
    const clientErrors = validateFormAnswers(form.fields, answers);
    if (clientErrors) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/required-forms/${trackingId}/fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onSubmitted(trackingId, new Date().toISOString());
      onClose();
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!trackingId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form?.formName ?? "Fill on behalf of client"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            You&apos;re filling this out on the client&apos;s behalf — it will still need staff
            review before it&apos;s marked complete.
          </p>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {loadError && <p className="text-sm text-destructive py-4">{loadError}</p>}

        {form && (
          <div className="space-y-4">
            <FormRenderer
              fields={form.fields}
              mode="fill"
              answers={answers}
              onChange={(fieldId, value) => setAnswers((prev) => ({ ...prev, [fieldId]: value }))}
              errors={errors}
            />
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <DialogFooter>
              <Button onClick={submit} disabled={submitting} className="w-full sm:w-auto">
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Submit
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
