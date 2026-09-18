"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user-context";

interface PhotoItem {
  id: string;
  uploadedAt: string;
  url: string | null;
}

interface RequestInfo {
  requirement: "OPTIONAL" | "REQUIRED";
  status: "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED";
  instructions: string;
  serviceName: string;
}

function fmt(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Treatment-area photos the client sent for this booking, shown where staff already look at an
 * appointment. Renders nothing at all for services that never asked for one, so the panel is
 * unchanged for the vast majority of bookings.
 */
export function AppointmentPhotos({ eventId }: { eventId: string }) {
  const { can, timezone } = useCurrentUser();
  const canView = can("booking_photos", "View");

  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView || !eventId) return;
    let active = true;
    setLoading(true);
    fetch(`/api/booking-photos/event/${eventId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setRequest(data.request ?? null);
        setPhotos(data.photos ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventId, canView]);

  if (!canView || (!loading && !request)) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 flex items-center gap-1.5">
        <Camera className="h-3 w-3" /> Treatment-area photos
      </h3>
      {loading ? (
        <div className="rounded-lg border bg-card p-4 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {photo.url ? (
                    // A private, expiring URL — not a public asset, so next/image can't serve it.
                    <img
                      src={photo.url}
                      alt={`Client photo uploaded ${fmt(photo.uploadedAt, timezone ?? undefined)}`}
                      className="w-full h-28 object-cover rounded-md border"
                    />
                  ) : (
                    <div className="w-full h-28 rounded-md border bg-muted" />
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {fmt(photo.uploadedAt, timezone ?? undefined)}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {request?.requirement === "REQUIRED"
                ? "Required photo not uploaded yet."
                : request?.status === "SKIPPED"
                  ? "The client chose to skip the optional photo."
                  : "No photo uploaded yet (optional)."}
            </p>
          )}
          {request && <p className="text-[11px] text-muted-foreground">{request.instructions}</p>}
        </div>
      )}
    </section>
  );
}
