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
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { FormResponseView } from "@/components/forms/FormResponseView";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { validateFormAnswers } from "@/lib/forms/validate";
import type { FormField } from "@/lib/forms/types";

interface ResponseData {
  formName: string;
  fields: FormField[];
  answers: Record<string, unknown>;
  submittedAt: string | null;
  enteredByStaffName: string | null;
  editedByStaffName: string | null;
  editedAt: string | null;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Fetches and shows a single completed in-house form's submitted answers — read-only by
 * default, with an "Edit" action that lets staff correct a mistake (typo, missed detail) and
 * save the change. Shared between AppointmentSlideOver (booking-centric) and the customer
 * profile Forms tab (customer-centric) — same "View Response" action, same data, two entry
 * points. */
export function FormResponseDialog({
  trackingId,
  onClose,
}: {
  trackingId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trackingId) return;
    setData(null);
    setError(null);
    setEditing(false);
    setFieldErrors({});
    setLoading(true);
    fetch(`/api/required-forms/${trackingId}/response`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load response");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load response"))
      .finally(() => setLoading(false));
  }, [trackingId]);

  const startEditing = () => {
    if (!data) return;
    setDraftAnswers(data.answers);
    setFieldErrors({});
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setFieldErrors({});
  };

  const save = async () => {
    if (!trackingId || !data) return;
    const clientErrors = validateFormAnswers(data.fields, draftAnswers);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/required-forms/${trackingId}/response`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: draftAnswers }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.errors) setFieldErrors(body.errors);
        toast.error(body.error ?? "Failed to save changes");
        return;
      }
      setData(body);
      setEditing(false);
      toast.success("Response updated");
    } catch {
      toast.error("Network error — please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!trackingId}
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>{data?.formName ?? "Form response"}</DialogTitle>
            {data && !editing && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs flex-shrink-0"
                onClick={startEditing}
              >
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
          </div>
          {data?.submittedAt && (
            <p className="text-xs text-muted-foreground">Submitted {fmt(data.submittedAt)}</p>
          )}
          {data?.enteredByStaffName && (
            <p className="text-xs text-muted-foreground">
              Filled in by {data.enteredByStaffName} on the client&apos;s behalf
            </p>
          )}
          {data?.editedByStaffName && data.editedAt && (
            <p className="text-xs text-muted-foreground">
              Last edited by {data.editedByStaffName} on {fmt(data.editedAt)}
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-sm text-destructive py-4">{error}</p>}

        {data && !editing && <FormResponseView fields={data.fields} answers={data.answers} />}

        {data && editing && (
          <div className="space-y-4">
            <FormRenderer
              fields={data.fields}
              mode="fill"
              answers={draftAnswers}
              onChange={(fieldId, value) =>
                setDraftAnswers((prev) => ({ ...prev, [fieldId]: value }))
              }
              errors={fieldErrors}
            />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
