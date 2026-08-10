import { CheckCheck, X } from "lucide-react";
import type { FormField } from "@/lib/forms/types";

/**
 * Read-only rendering of a client's submitted answers — deliberately NOT built on FormRenderer's
 * input controls (even disabled ones), since real form controls read as editable regardless of a
 * `disabled` attribute. Staff can look, never modify, per the spec this backs.
 *
 * This system has no file-upload or drawn-signature field type (see src/lib/forms/types.ts) —
 * "consent" is the closest analog, a boolean confirmation checkbox, rendered below as a
 * confirmed/not-confirmed line rather than an image.
 */
function AnswerValue({ field, value }: { field: FormField; value: unknown }) {
  if (field.type === "consent") {
    return value === true ? (
      <span className="inline-flex items-center gap-1 text-success text-sm">
        <CheckCheck className="h-3.5 w-3.5" /> Confirmed
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
        <X className="h-3.5 w-3.5" /> Not confirmed
      </span>
    );
  }

  if (field.type === "yes_no") {
    const label = value === "yes" ? "Yes" : value === "no" ? "No" : null;
    return <span className="text-sm">{label ?? <Empty />}</span>;
  }

  if (field.type === "checkbox") {
    const selected = Array.isArray(value) ? value : [];
    return <span className="text-sm">{selected.length > 0 ? selected.join(", ") : <Empty />}</span>;
  }

  if (field.type === "date" && typeof value === "string" && value) {
    return (
      <span className="text-sm">
        {new Date(value).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    );
  }

  const text = typeof value === "string" ? value.trim() : "";
  return <span className="text-sm whitespace-pre-wrap">{text || <Empty />}</span>;
}

function Empty() {
  return <span className="text-muted-foreground italic">No answer</span>;
}

export function FormResponseView({
  fields,
  answers,
}: {
  fields: FormField[];
  answers: Record<string, unknown>;
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">This form has no questions.</p>;
  }

  return (
    <div className="rounded-md border divide-y">
      {fields.map((field) => (
        <div key={field.id} className="px-3 py-2.5">
          <div className="text-xs font-medium text-muted-foreground">
            {field.label || "Untitled question"}
          </div>
          <div className="mt-1">
            <AnswerValue field={field} value={answers[field.id]} />
          </div>
        </div>
      ))}
    </div>
  );
}
