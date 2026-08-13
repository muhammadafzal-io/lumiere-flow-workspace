"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { validateFormAnswers } from "@/lib/forms/validate";
import type { FormField } from "@/lib/forms/types";

export function FormFillForm({
  token,
  fields,
  onSubmitted,
}: {
  token: string;
  fields: FormField[];
  onSubmitted?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    const clientErrors = validateFormAnswers(fields, answers);
    if (clientErrors) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        setFormError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setDone(true);
      onSubmitted?.();
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-3 py-4">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <h2 className="font-semibold">Thank you!</h2>
        <p className="text-sm text-muted-foreground">
          Your responses have been submitted. We'll see you at your appointment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormRenderer
        fields={fields}
        mode="fill"
        answers={answers}
        onChange={(fieldId, value) => setAnswers((prev) => ({ ...prev, [fieldId]: value }))}
        errors={errors}
      />

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button onClick={submit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Submit
      </Button>
    </div>
  );
}
