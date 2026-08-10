"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  Eye,
  TriangleAlert,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AccessGate } from "@/components/rbac/AccessGate";
import { FormRenderer } from "@/components/forms/FormRenderer";
import type { FormField, FormFieldType } from "@/lib/forms/types";

interface FormListItem {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  status: string;
  attachedServiceCount: number;
  sourcePrompt: string | null;
  created_at: string;
}

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  date: "Date",
  yes_no: "Yes / No",
  checkbox: "Checkbox (multi-select)",
  radio: "Radio options",
  select: "Select / dropdown",
  consent: "Consent / signature",
};

const CHOICE_TYPES: FormFieldType[] = ["checkbox", "radio", "select"];

function blankField(): FormField {
  return { id: crypto.randomUUID(), type: "text", label: "", required: false };
}

function SortableFieldCard({
  field,
  index,
  onUpdate,
  onRemove,
}: {
  field: FormField;
  index: number;
  onUpdate: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}) {
  // Drag listeners are scoped to the grip handle only, not the whole card — the card is full of
  // text inputs and selects that need normal click/focus behavior, which a card-wide drag
  // listener would swallow.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-muted-foreground">Field {index + 1}</span>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={field.type} onValueChange={(v) => onUpdate({ type: v as FormFieldType })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between rounded-md border px-3 h-9">
          <Label className="mb-0 text-xs">Required</Label>
          <Switch checked={field.required} onCheckedChange={(v) => onUpdate({ required: v })} />
        </div>
      </div>
      <Input
        placeholder="Label / question"
        value={field.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
      />
      {CHOICE_TYPES.includes(field.type) && (
        <Input
          placeholder="Options, comma-separated (e.g. Yes, No, Not sure)"
          value={(field.options ?? []).join(", ")}
          onChange={(e) =>
            onUpdate({
              options: e.target.value
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean),
            })
          }
        />
      )}
      <Input
        placeholder="Help text (optional)"
        value={field.helpText ?? ""}
        onChange={(e) => onUpdate({ helpText: e.target.value })}
      />
    </div>
  );
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FormListItem | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [sourcePrompt, setSourcePrompt] = useState<string | null>(null);
  // Scratch answers for the interactive preview only — never sent anywhere, just lets an admin
  // click through the form to see how it feels before saving. Reset whenever the field list is
  // freshly loaded (new form, editing a different form, or a new AI generation).
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FormListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchForms = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    try {
      const res = await fetch("/api/forms");
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error();
      const json = await res.json();
      setForms(json.forms ?? []);
    } catch {
      toast.error("Failed to load forms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchForms();
  }, [fetchForms]);

  const startAdd = () => {
    setEditing(null);
    setPrompt("");
    setName("");
    setFields([]);
    setSourcePrompt(null);
    setPreviewAnswers({});
    setPreviewOpen(false);
    setDialogOpen(true);
  };

  const startEdit = (form: FormListItem) => {
    setEditing(form);
    setPrompt("");
    setName(form.name);
    setFields(form.fields);
    setSourcePrompt(form.sourcePrompt);
    setPreviewAnswers({});
    setPreviewOpen(false);
    setDialogOpen(true);
  };

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe what the form should contain first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/forms/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to generate form");
      }
      const json = await res.json();
      setName(json.name ?? "");
      setFields(json.fields ?? []);
      setSourcePrompt(prompt.trim());
      setPreviewAnswers({});
      setPreviewOpen(false);
      toast.success("Form generated — review and edit before saving");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate form");
    } finally {
      setGenerating(false);
    }
  };

  const addField = () => setFields((f) => [...f, blankField()]);
  const removeField = (i: number) => setFields((f) => f.filter((_, idx) => idx !== i));
  const updateField = (i: number, patch: Partial<FormField>) =>
    setFields((f) => f.map((field, idx) => (idx === i ? { ...field, ...patch } : field)));

  const fieldSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Form name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { name, fields, sourcePrompt };
      const method = editing ? "PATCH" : "POST";
      const url = editing ? `/api/forms/${editing.id}` : "/api/forms";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save form");
      }
      const json = await res.json();
      const saved = json.form as FormListItem;
      setForms((prev) =>
        editing
          ? prev.map((f) =>
              f.id === saved.id
                ? { ...saved, attachedServiceCount: editing.attachedServiceCount }
                : f,
            )
          : [...prev, { ...saved, attachedServiceCount: 0 }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
      );
      setDialogOpen(false);
      toast.success(`Form ${editing ? "updated" : "created"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save form");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemoveForm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/forms/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setForms((prev) => prev.filter((f) => f.id !== pendingDelete.id));
      toast.success("Form deleted");
      setPendingDelete(null);
    } catch {
      toast.error("Failed to delete form");
    } finally {
      setDeleting(false);
    }
  };

  if (accessDenied) {
    return (
      <div className="space-y-5 max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create consent and intake forms with AI, then attach them to a procedure in Settings →
            Services.
          </p>
        </div>
        <Button onClick={startAdd}>
          <Sparkles className="h-4 w-4 mr-1.5" /> Create Form with AI
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Fields</th>
              <th className="px-4 py-3">Attached services</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id} className="border-t">
                <td className="px-4 py-3">{form.name}</td>
                <td className="px-4 py-3">{form.fields.length}</td>
                <td className="px-4 py-3">{form.attachedServiceCount}</td>
                <td className="px-4 py-3">{form.status}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(form)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPendingDelete(form)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && forms.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No forms yet — create one with AI to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit form" : "Create form with AI"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {!editing && (
              <div className="space-y-2">
                <Label>Describe the form</Label>
                <Textarea
                  placeholder='e.g. "Create a pre-treatment consent form for Botox treatment. Ask about allergies, medications, pregnancy, previous Botox treatments, and include consent confirmation."'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                />
                <Button type="button" variant="outline" onClick={generate} disabled={generating}>
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Generate
                </Button>
              </div>
            )}

            <div>
              <Label>Form name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>

            <div>
              <Label className="mb-2 block">Preview</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={fields.length === 0}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview form
              </Button>
              {fields.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Add at least one field to preview the form.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Fields</Label>
                <Button type="button" variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add field
                </Button>
              </div>
              <div className="space-y-3">
                <DndContext
                  sensors={fieldSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext
                    items={fields.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {fields.map((field, i) => (
                        <SortableFieldCard
                          key={field.id}
                          field={field}
                          index={i}
                          onUpdate={(patch) => updateField(i, patch)}
                          onRemove={() => removeField(i)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {fields.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No fields yet — generate with AI or add one manually.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-muted/30">
          <DialogTitle className="sr-only">Form preview</DialogTitle>
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-warning-foreground">
              Preview — not published
            </span>
          </div>
          <div className="rounded-2xl border bg-card shadow-sm p-8 space-y-6">
            <div className="space-y-1 text-center">
              <h1 className="text-lg font-semibold">{name || "Untitled form"}</h1>
            </div>
            <FormRenderer
              fields={fields}
              mode="fill"
              answers={previewAnswers}
              onChange={(fieldId, value) =>
                setPreviewAnswers((prev) => ({ ...prev, [fieldId]: value }))
              }
            />
            <p className="text-xs text-muted-foreground text-center">
              This is a preview only — nothing you enter here is saved or sent anywhere.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto sm:mx-0 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <TriangleAlert className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center sm:text-left">
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center sm:text-left">
              This permanently deletes the form and every response a client has ever submitted to
              it. This cannot be undone.
              {!!pendingDelete && pendingDelete.attachedServiceCount > 0 && (
                <span className="mt-2 block rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive font-medium">
                  It&apos;s currently attached to {pendingDelete.attachedServiceCount}{" "}
                  {pendingDelete.attachedServiceCount === 1 ? "service" : "services"} — those
                  bookings will stop receiving this form immediately.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemoveForm} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete form
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
