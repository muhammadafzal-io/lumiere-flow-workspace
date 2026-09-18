import { NextRequest, NextResponse } from "next/server";
import {
  BookingPhotosUnavailableError,
  deletePhoto,
  getPhotoById,
  getPhotoRequestByToken,
  setRequestStatus,
  signedPhotoUrl,
  storePhoto,
} from "@/lib/booking/photos";
import {
  checkUploadedFile,
  MAX_PHOTOS_PER_REQUEST,
  photoInstructions,
  sniffImageType,
} from "@/lib/booking/photo-rules";

export const dynamic = "force-dynamic";

/**
 * The client's own upload endpoint. The token in the URL is the only credential — it is single
 * purpose, random, and tied to one booking, so no client or appointment id can be guessed to reach
 * someone else's photos. Everything returned here is scoped to that one request.
 */

type RouteCtx = { params: Promise<{ token: string }> };

function unavailable(err: unknown): NextResponse | null {
  if (err instanceof BookingPhotosUnavailableError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params;
    const found = await getPhotoRequestByToken(token);
    if (!found) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    const { request, photos } = found;

    // The client sees their own photos, through the same short-lived signed URLs staff get.
    const withUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        uploadedAt: p.uploadedAt,
        url: await signedPhotoUrl(p),
      })),
    );

    return NextResponse.json({
      serviceName: request.serviceName,
      requirement: request.requirement,
      status: request.status,
      instructions: photoInstructions(request.instructions, request.serviceName),
      maxPhotos: MAX_PHOTOS_PER_REQUEST,
      photos: withUrls,
    });
  } catch (err) {
    const res = unavailable(err);
    if (res) return res;
    console.error("GET /api/booking-photos/[token] error:", err);
    return NextResponse.json({ error: "Failed to load this page" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params;
    const found = await getPhotoRequestByToken(token);
    if (!found) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    const { request, photos } = found;
    if (request.status === "CANCELLED") {
      return NextResponse.json({ error: "This appointment was cancelled." }, { status: 409 });
    }
    if (photos.length >= MAX_PHOTOS_PER_REQUEST) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_PHOTOS_PER_REQUEST} photos.` },
        { status: 400 },
      );
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("photo");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
    }

    const declared = checkUploadedFile({ type: file.type, size: file.size });
    if (!declared.ok) return NextResponse.json({ error: declared.error }, { status: 400 });

    // What the bytes actually are decides what gets stored — the declared type and the filename
    // are both supplied by the uploader and can lie.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImageType(bytes);
    if (!contentType) {
      return NextResponse.json(
        { error: "That file isn't a JPEG, PNG or WebP photo." },
        { status: 400 },
      );
    }

    const stored = await storePhoto({ request, bytes, contentType });
    return NextResponse.json(
      {
        photo: { id: stored.id, uploadedAt: stored.uploadedAt, url: await signedPhotoUrl(stored) },
      },
      { status: 201 },
    );
  } catch (err) {
    const res = unavailable(err);
    if (res) return res;
    console.error("POST /api/booking-photos/[token] error:", err);
    return NextResponse.json({ error: "That upload didn't go through." }, { status: 500 });
  }
}

/** Skip (optional requests only) or remove one of the client's own photos. */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params;
    const found = await getPhotoRequestByToken(token);
    if (!found) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    const { request } = found;

    const body = await req.json().catch(() => ({}));

    if (body.action === "skip") {
      if (request.requirement !== "OPTIONAL") {
        return NextResponse.json(
          { error: "A photo is required for this appointment." },
          { status: 400 },
        );
      }
      await setRequestStatus(request.id, "SKIPPED");
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete" && typeof body.photoId === "string") {
      const photo = await getPhotoById(body.photoId);
      // Scoped to this token's own request, so one link can never delete another's photo.
      if (!photo || photo.requestId !== request.id) {
        return NextResponse.json({ error: "Photo not found" }, { status: 404 });
      }
      await deletePhoto(photo);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const res = unavailable(err);
    if (res) return res;
    console.error("PATCH /api/booking-photos/[token] error:", err);
    return NextResponse.json({ error: "That didn't go through." }, { status: 500 });
  }
}
