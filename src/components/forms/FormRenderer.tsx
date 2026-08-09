"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormField } from "@/lib/forms/types";

interface FormRendererProps {
  fields: FormField[];
  /** "preview" (default) is a disabled, non-interactive look at what the form will look like —
   * used in the admin builder. "fill" makes every control real and controlled via `answers`/
   * `onChange`, for the client-facing fill-out page. */
  mode?: "preview" | "fill";
  answers?: Record<string, unknown>;
  onChange?: (fieldId: string, value: unknown) => void;
  errors?: Record<string, string>;
}

function FieldLabel({ field }: { field: FormField }) {
  return (
    <div className="mb-1.5">
      <Label className="text-sm">
        {field.label || "Untitled question"}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {field.helpText && <p className="text-xs text-muted-foreground mt-0.5">{field.helpText}</p>}
    </div>
  );
}

function FieldControl({
  field,
  mode,
  value,
  onChange,
}: {
  field: FormField;
  mode: "preview" | "fill";
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const disabled = mode === "preview";
  // Only used in preview mode — nothing here is submitted or persisted, it's purely a local look
  // at what the checkbox group will look like. In fill mode, checked state comes from `value`.
  const [previewCheckedOptions, setPreviewCheckedOptions] = useState<Record<string, boolean>>({});

  switch (field.type) {
    case "text":
      return (
        <Input
          placeholder="Your answer"
          disabled={disabled}
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onChange={mode === "fill" ? (e) => onChange(e.target.value) : undefined}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          placeholder="0"
          disabled={disabled}
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onChange={mode === "fill" ? (e) => onChange(e.target.value) : undefined}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          disabled={disabled}
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onChange={mode === "fill" ? (e) => onChange(e.target.value) : undefined}
        />
      );
    case "textarea":
      return (
        <Textarea
          placeholder="Your answer"
          disabled={disabled}
          rows={3}
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onChange={mode === "fill" ? (e) => onChange(e.target.value) : undefined}
        />
      );
    case "yes_no":
      return (
        <RadioGroup
          className="flex gap-4"
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onValueChange={mode === "fill" ? onChange : undefined}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${field.id}-yes`} disabled={disabled} />
            <Label htmlFor={`${field.id}-yes`} className="font-normal">
              Yes
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${field.id}-no`} disabled={disabled} />
            <Label htmlFor={`${field.id}-no`} className="font-normal">
              No
            </Label>
          </div>
        </RadioGroup>
      );
    case "radio":
      return (
        <RadioGroup
          className="gap-2"
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onValueChange={mode === "fill" ? onChange : undefined}
        >
          {(field.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`${field.id}-${i}`} disabled={disabled} />
              <Label htmlFor={`${field.id}-${i}`} className="font-normal">
                {opt}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    case "checkbox": {
      const selected = mode === "fill" ? ((value as string[]) ?? []) : [];
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((opt, i) => {
            const checked = mode === "fill" ? selected.includes(opt) : !!previewCheckedOptions[opt];
            return (
              <div key={i} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.id}-${i}`}
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (mode === "fill") {
                      onChange(v === true ? [...selected, opt] : selected.filter((o) => o !== opt));
                    } else {
                      setPreviewCheckedOptions((prev) => ({ ...prev, [opt]: v === true }));
                    }
                  }}
                />
                <Label htmlFor={`${field.id}-${i}`} className="font-normal">
                  {opt}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }
    case "select":
      return (
        <Select
          disabled={disabled}
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onValueChange={mode === "fill" ? onChange : undefined}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt, i) => (
              <SelectItem key={i} value={opt || `option-${i}`}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "consent":
      return (
        <div className="flex items-start gap-2">
          <Checkbox
            id={field.id}
            className="mt-0.5"
            checked={mode === "fill" ? value === true : undefined}
            onCheckedChange={mode === "fill" ? (v) => onChange(v === true) : undefined}
          />
          <Label htmlFor={field.id} className="font-normal leading-snug">
            {field.label || "I consent."}
          </Label>
        </div>
      );
    default:
      return (
        <Input
          placeholder="Your answer"
          disabled={disabled}
          value={mode === "fill" ? ((value as string) ?? "") : undefined}
          onChange={mode === "fill" ? (e) => onChange(e.target.value) : undefined}
        />
      );
  }
}

export function FormRenderer({
  fields,
  mode = "preview",
  answers = {},
  onChange,
  errors = {},
}: FormRendererProps) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No fields yet.</p>;
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.id}>
          {field.type !== "consent" && <FieldLabel field={field} />}
          <FieldControl
            field={field}
            mode={mode}
            value={answers[field.id]}
            onChange={(value) => onChange?.(field.id, value)}
          />
          {mode === "fill" && errors[field.id] && (
            <p className="text-xs text-destructive mt-1">{errors[field.id]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
