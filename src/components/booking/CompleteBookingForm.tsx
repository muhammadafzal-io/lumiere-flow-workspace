"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { isFullName } from "@/lib/agent/client-name";
import { isValidBirthdayInput } from "@/lib/birthday";

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function CompleteBookingForm({
  token,
  initialName,
}: {
  token: string;
  initialName: string;
}) {
  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validate = (): Record<string, string> | null => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required.";
    else if (!isFullName(fullName)) next.fullName = "Please enter your first and last name.";

    if (!email.trim() || !validateEmail(email)) next.email = "Please enter a valid email address.";
    else if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      next.confirmEmail =
        "Doesn't match the email above — a mistyped address will bounce silently.";
    }

    if (!isValidBirthdayInput(birthday)) next.birthday = "Please enter a valid date of birth.";

    return Object.keys(next).length > 0 ? next : null;
  };

  const submit = async () => {
    setFormError(null);
    const clientErrors = validate();
    if (clientErrors) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/booking/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fullName: fullName.trim(), email: email.trim(), birthday }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        setFormError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setDone(true);
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
        <h2 className="font-semibold">You're all set!</h2>
        <p className="text-sm text-muted-foreground">
          Your appointment is confirmed and a confirmation email is on its way.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Full name</Label>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1.5"
          placeholder="First and last name"
        />
        {errors.fullName && <p className="text-xs text-destructive mt-1">{errors.fullName}</p>}
      </div>

      <div>
        <Label>Email address</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5"
          placeholder="you@example.com"
        />
        {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
      </div>

      <div>
        <Label>Confirm email address</Label>
        <Input
          type="email"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          className="mt-1.5"
          placeholder="Re-enter your email"
        />
        {errors.confirmEmail && (
          <p className="text-xs text-destructive mt-1">{errors.confirmEmail}</p>
        )}
      </div>

      <div>
        <Label>Date of birth</Label>
        <Input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="mt-1.5"
        />
        {errors.birthday && <p className="text-xs text-destructive mt-1">{errors.birthday}</p>}
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button onClick={submit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Complete my booking
      </Button>
    </div>
  );
}
