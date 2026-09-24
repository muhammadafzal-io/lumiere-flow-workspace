"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useAccountData } from "@/lib/account/use-account-data";
import { AccountCard, AccountError } from "@/components/account/AccountUI";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The client's own notes — preferences, questions for their next visit, how a treatment felt.
 * Private to them: these are stored apart from the clinic's internal notes, and the clinic's notes
 * are never shown here.
 */

interface Note {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
}

const MAX = 2000;

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function PersonalNotes() {
  const { data, loading, error, reload } = useAccountData<{ notes: Note[] }>("/api/account/notes");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const call = async (url: string, init: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "We couldn't do that just now.");
    return json;
  };

  const add = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await call("/api/account/notes", { method: "POST", body: JSON.stringify({ body: draft }) });
      setDraft("");
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "We couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    setFormError(null);
    try {
      await call(`/api/account/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: editText }),
      });
      setEditingId(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "We couldn't save that.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this note?")) return;
    setBusyId(id);
    setFormError(null);
    try {
      await call(`/api/account/notes/${id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "We couldn't delete that.");
    } finally {
      setBusyId(null);
    }
  };

  const notes = data?.notes ?? [];

  return (
    <div className="space-y-4">
      <AccountCard className="p-5">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for yourself — preferences, questions for next time, how a treatment felt…"
          maxLength={MAX}
          rows={3}
          aria-label="New note"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Only you can see your notes. {draft.length}/{MAX}
          </span>
          <Button
            type="button"
            size="sm"
            className="rounded-full px-5"
            onClick={add}
            disabled={saving || !draft.trim()}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add note
          </Button>
        </div>
      </AccountCard>

      {formError && <AccountError message={formError} />}
      {error && <AccountError message={error} onRetry={reload} />}

      {loading ? null : notes.length === 0 && !error ? (
        <p className="px-1 text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <AccountCard className="p-4 sm:p-5">
                {editingId === note.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={MAX}
                      rows={3}
                      aria-label="Edit note"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-full"
                        onClick={() => saveEdit(note.id)}
                        disabled={busyId === note.id || !editText.trim()}
                      >
                        {busyId === note.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setEditingId(null)}
                        disabled={busyId === note.id}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {note.body}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {fmt(note.createdAt)}
                        {note.updatedAt ? " · edited" : ""}
                      </span>
                      <span className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full px-3 text-muted-foreground"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditText(note.body);
                          }}
                          aria-label="Edit note"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => remove(note.id)}
                          disabled={busyId === note.id}
                          aria-label="Delete note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </div>
                  </>
                )}
              </AccountCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
