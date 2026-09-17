"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/lib/current-user-context";
import {
  CLIENT_NOTE_MAX_LENGTH,
  validateNoteBody,
  type ClientNote,
} from "@/lib/customers/notes-shared";

const COLLAPSED_LENGTH = 280;

function formatNoteTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

/**
 * Practitioner notes for a client. Notes belong to the client, so every appointment shows them all;
 * `eventId` is the appointment new notes are written from, and `eventLabels` names the appointment
 * each existing note came from.
 */
export function ClientNotesPanel({
  clientId,
  eventId,
  eventLabels,
}: {
  clientId: string;
  eventId?: string;
  eventLabels?: Map<string, string>;
}) {
  const { can, user, timezone } = useCurrentUser();
  const canView = can("client_notes", "View");
  const canCreate = can("client_notes", "Create");
  const canUpdate = can("client_notes", "Update");
  const canDelete = can("client_notes", "Delete");
  const canManage = can("client_notes", "Manage");
  const tz = timezone ?? undefined;

  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [updating, setUpdating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const requestRef = useRef(0);

  const fetchPage = useCallback(
    async (before?: string) => {
      const params = new URLSearchParams();
      if (before) params.set("before", before);
      const res = await fetch(`/api/customers/${clientId}/notes?${params}`);
      if (!res.ok) throw new Error(await readError(res, "Could not load notes."));
      return (await res.json()) as { notes: ClientNote[]; hasMore: boolean };
    },
    [clientId],
  );

  useEffect(() => {
    if (!canView) return;
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    fetchPage()
      .then((page) => {
        if (request !== requestRef.current) return;
        setNotes(page.notes);
        setHasMore(page.hasMore);
      })
      .catch((e: Error) => {
        if (request === requestRef.current) setLoadError(e.message);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }, [canView, fetchPage]);

  if (!canView) return null;

  const loadMore = async () => {
    const last = notes[notes.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(last.createdAt);
      setNotes((prev) => [...prev, ...page.notes.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const addNote = async () => {
    const valid = validateNoteBody(draft);
    if (!valid.ok) {
      toast.error(valid.error);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: valid.body, eventId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not save the note."));
      const { note } = (await res.json()) as { note: ClientNote };
      setNotes((prev) => [note, ...prev]);
      setDraft("");
      toast.success("Note added");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (noteId: string) => {
    const valid = validateNoteBody(editDraft);
    if (!valid.ok) {
      toast.error(valid.error);
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch(`/api/customers/${clientId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: valid.body }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not update the note."));
      const { note } = (await res.json()) as { note: ClientNote };
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
      setEditingId(null);
      toast.success("Note updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${clientId}/notes/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res, "Could not delete the note."));
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      toast.success("Note deleted");
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note about this client…"
            rows={3}
            maxLength={CLIENT_NOTE_MAX_LENGTH}
            aria-label="New note"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {draft.length > CLIENT_NOTE_MAX_LENGTH - 500 &&
                `${draft.length} / ${CLIENT_NOTE_MAX_LENGTH}`}
            </span>
            <Button size="sm" onClick={addNote} disabled={saving || !draft.trim()}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add note
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">{loadError}</div>
      ) : notes.length === 0 ? (
        <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
          No practitioner notes yet.
        </div>
      ) : (
        <div className="rounded-md border divide-y text-sm">
          {notes.map((note) => {
            const own = !!user && note.authorUserId === user.id;
            const mayEdit = canUpdate && (own || canManage);
            const mayDelete = canDelete && (own || canManage);
            const long = note.body.length > COLLAPSED_LENGTH;
            const open = expanded.has(note.id);
            const fromLabel = note.eventId ? eventLabels?.get(note.eventId) : undefined;
            const fromThis = !!eventId && note.eventId === eventId;
            return (
              <div key={note.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-muted-foreground min-w-0">
                    <span className="font-medium text-foreground">{note.authorName}</span> ·{" "}
                    {formatNoteTime(note.createdAt, tz)}
                    {note.updatedAt && " · edited"}
                    {fromThis ? (
                      <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                        This appointment
                      </span>
                    ) : (
                      fromLabel && <div className="mt-0.5">From {fromLabel}</div>
                    )}
                  </div>
                  {editingId !== note.id && (mayEdit || mayDelete) && (
                    <div className="flex gap-1 flex-shrink-0">
                      {mayEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Edit note"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditDraft(note.body);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {mayDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Delete note"
                          onClick={() => setDeleteTarget(note)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {editingId === note.id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={4}
                      maxLength={CLIENT_NOTE_MAX_LENGTH}
                      aria-label="Edit note"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        disabled={updating}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(note.id)} disabled={updating}>
                        {updating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1.5 whitespace-pre-wrap break-words">
                      {long && !open ? `${note.body.slice(0, COLLAPSED_LENGTH)}…` : note.body}
                    </p>
                    {long && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-primary hover:underline"
                        onClick={() => toggleExpanded(note.id)}
                      >
                        {open ? "Show less" : "Show more"}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && !loading && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
          {loadingMore && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Load older notes
        </Button>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              The note is removed for everyone. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep note</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
