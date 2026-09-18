import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import {
  BookingPhotosUnavailableError,
  getPhotoRequestByEvent,
  listPhotos,
  signedPhotoUrl,
} from "@/lib/booking/photos";
import { photoInstructions } from "@/lib/booking/photo-rules";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ eventId: string }> };

/**
 * Staff view of one booking's treatment-area photos. The bucket is private, so the only way to see
 * a photo is a short-lived signed URL issued here — after the permission check, never before.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("booking_photos", "View");
  if (!check.ok) return check.response;

  try {
    const { eventId } = await ctx.params;
    const request = await getPhotoRequestByEvent(eventId);
    if (!request) return NextResponse.json({ request: null, photos: [] });

    const photos = await listPhotos(request.id);
    const withUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        uploadedAt: p.uploadedAt,
        contentType: p.contentType,
        url: await signedPhotoUrl(p),
      })),
    );

    return NextResponse.json({
      request: {
        requirement: request.requirement,
        status: request.status,
        instructions: photoInstructions(request.instructions, request.serviceName),
        serviceName: request.serviceName,
        completedAt: request.completedAt,
      },
      photos: withUrls,
    });
  } catch (err) {
    if (err instanceof BookingPhotosUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("GET /api/booking-photos/event/[eventId] error:", err);
    return NextResponse.json({ error: "Failed to load photos" }, { status: 500 });
  }
}
