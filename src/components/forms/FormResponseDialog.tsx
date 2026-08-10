"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { FormResponseView } from "@/components/forms/FormResponseView";
import type { FormField } from "@/lib/forms/types";

interface ResponseData {
  formName: string;
  fields: FormField[];
  answers: Record<string, unknown>;
  submittedAt: string | null;
}

/** Fetches and shows a single completed in-house form's submitted answers, read-only. Shared
 * between AppointmentSlideOver (booking-centric) and the customer profile Forms tab
 * (customer-centric) — same "View Response" action, same data, two entry points. */
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

  useEffect(() => {
    if (!trackingId) return;
    setData(null);
    setError(null);
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

  return (
    <Dialog open={!!trackingId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.formName ?? "Form response"}</DialogTitle>
          {data?.submittedAt && (
            <p className="text-xs text-muted-foreground">
              Submitted{" "}
              {new Date(data.submittedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-sm text-destructive py-4">{error}</p>}
        {data && <FormResponseView fields={data.fields} answers={data.answers} />}
      </DialogContent>
    </Dialog>
  );
}
