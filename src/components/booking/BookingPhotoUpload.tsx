"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTOS_PER_REQUEST } from "@/lib/booking/photo-rules";

interface PhotoItem {
  id: string;
  uploadedAt: string;
  url: string | null;
}

/**
 * The client's upload page, reached from the link in their confirmation. Deliberately plain and
 * phone-first: on a mobile browser the file input opens the camera, which is how most clients will
 * take a photo of the area they want treated.
 */
export function BookingPhotoUpload({
  token,
  serviceName,
  requirement,
  instructions,
}: {
  token: string;
  serviceName: string;
  requirement: "OPTIONAL" | "REQUIRED";
  instructions: string;
}) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/booking-photos/${token}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't load this page.");
      setPhotos(data.photos ?? []);
      setStatus(data.status ?? "PENDING");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this page.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("photo", file);
      const res = await fetch(`/api/booking-photos/${token}`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "That upload didn't go through.");
      setPhotos((prev) => [...prev, data.photo]);
      setStatus("COMPLETED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That upload didn't go through.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (photoId: string) => {
    setError(null);
    setBusyId(photoId);
    try {
      const res = await fetch(`/api/booking-photos/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", photoId }),
      });
      if (!res.ok) throw new Error("Couldn't remove that photo.");
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setStatus((prev) => (photos.length <= 1 ? "PENDING" : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that photo.");
    } finally {
      setBusyId(null);
    }
  };

  const skip = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/booking-photos/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });
      if (!res.ok) throw new Error("Couldn't save that.");
      setStatus("SKIPPED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    }
  };

  const atLimit = photos.length >= MAX_PHOTOS_PER_REQUEST;
  const done = photos.length > 0;

  return (
    <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Photo for your {serviceName} appointment</h1>
        <p className="text-sm text-muted-foreground">{instructions}</p>
        <p className="text-xs text-muted-foreground">
          {requirement === "REQUIRED"
            ? "This is needed before your appointment."
            : "This is optional — it just helps us prepare."}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="relative">
                  {photo.url ? (
                    // A private, expiring URL — not a public asset, so next/image can't serve it.
                    <img
                      src={photo.url}
                      alt="Photo you uploaded"
                      className="w-full h-32 object-cover rounded-md border"
                    />
                  ) : (
                    <div className="w-full h-32 rounded-md border bg-muted" />
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1 right-1 h-7 w-7"
                    aria-label="Remove photo"
                    disabled={busyId === photo.id}
                    onClick={() => void remove(photo.id)}
                  >
                    {busyId === photo.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {done && (
            <p className="text-sm text-success flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Thanks — we&apos;ve got your photo.
            </p>
          )}
          {status === "SKIPPED" && !done && (
            <p className="text-sm text-muted-foreground">
              No problem — you can still add one any time before your appointment.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_PHOTO_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={uploading || atLimit}
              className="w-full"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-1.5" />
              )}
              {done ? "Add another photo" : "Upload photo"}
            </Button>
            {requirement === "OPTIONAL" && !done && status !== "SKIPPED" && (
              <Button variant="ghost" onClick={() => void skip()} disabled={uploading}>
                Skip for now
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {atLimit
              ? `That's the maximum of ${MAX_PHOTOS_PER_REQUEST} photos.`
              : "JPEG, PNG or WebP, up to 10MB. Only the clinic can see your photos."}
          </p>
        </>
      )}
    </div>
  );
}
