import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { getAppBaseUrl } from "@/lib/client-channels";
import {
  photoStoragePath,
  type PhotoRequestStatus,
  type PhotoRequirement,
  type ALLOWED_PHOTO_TYPES,
} from "@/lib/booking/photo-rules";

/**
 * Treatment-area photos for a booking.
 *
 * The request row is keyed by the calendar event id, the same way BookingCompletions,
 * RequiredFormTracking and BookingApprovals hang off a booking. The files themselves live in a
 * private Storage bucket — this database only ever holds their paths, and nothing is served from
 * a public URL.
 */

const REQUESTS = "BookingPhotoRequests";
const PHOTOS = "BookingPhotos";
export const PHOTO_BUCKET = "booking-photos";

/** How long a staff member's view of a photo stays valid. Long enough to look at, not to share. */
const SIGNED_URL_TTL_SECONDS = 300;

export interface BookingPhoto {
  id: string;
  requestId: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface BookingPhotoRequest {
  id: string;
  eventId: string;
  serviceId: string | null;
  clientId: string | null;
  token: string;
  requirement: Exclude<PhotoRequirement, "NONE">;
  status: PhotoRequestStatus;
  instructions: string | null;
  serviceName: string;
  completedAt: string | null;
  createdAt: string;
}

export class BookingPhotosUnavailableError extends Error {
  constructor() {
    super("Treatment-area photos aren't set up yet — run migrations/create_booking_photos.sql.");
  }
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(error.message ?? "")
  );
}

function fail(op: string, error: { code?: string; message?: string }): never {
  if (isMissingTable(error)) throw new BookingPhotosUnavailableError();
  throw new Error(`${op}: ${error.message}`);
}

function mapRequest(row: any): BookingPhotoRequest {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    serviceId: row.service_id ?? null,
    clientId: row.client_id ?? null,
    token: row.token,
    requirement: row.requirement,
    status: row.status,
    instructions: row.instructions ?? null,
    serviceName: row.service_name ?? "",
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
  };
}

function mapPhoto(row: any): BookingPhoto {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    storagePath: row.storage_path,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    uploadedAt: row.uploaded_at,
  };
}

export function photoUploadUrl(token: string): string {
  return `${getAppBaseUrl()}/booking/photos/${token}`;
}

/**
 * Opens (or re-points) the photo request for a booking. Re-running it for a different service
 * updates what is being asked for — a booking moved to another treatment needs a photo of that
 * treatment's area — while keeping the token the client may already have been sent.
 *
 * Never throws: the booking is already on the calendar by the time this runs.
 */
export async function openPhotoRequest(input: {
  eventId: string;
  serviceId: string | null;
  clientId: string | null;
  serviceName: string;
  requirement: Exclude<PhotoRequirement, "NONE">;
  instructions: string | null;
}): Promise<BookingPhotoRequest | null> {
  try {
    const existing = await getPhotoRequestByEvent(input.eventId);
    if (existing) {
      if (existing.serviceId === input.serviceId) return existing;
      const { data, error } = await getSupabase()
        .from(REQUESTS)
        .update({
          service_id: input.serviceId,
          service_name: input.serviceName,
          requirement: input.requirement,
          instructions: input.instructions,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapRequest(data);
    }

    const { data, error } = await getSupabase()
      .from(REQUESTS)
      .insert({
        event_id: input.eventId,
        service_id: input.serviceId,
        client_id: input.clientId,
        token: crypto.randomBytes(32).toString("base64url"),
        requirement: input.requirement,
        instructions: input.instructions,
        service_name: input.serviceName,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRequest(data);
  } catch (err) {
    console.error("[photos] openPhotoRequest failed:", err);
    return null;
  }
}

export async function getPhotoRequestByToken(
  token: string,
): Promise<{ request: BookingPhotoRequest; photos: BookingPhoto[] } | null> {
  const { data, error } = await getSupabase()
    .from(REQUESTS)
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) fail("getPhotoRequestByToken", error);
  if (!data) return null;
  const request = mapRequest(data);
  return { request, photos: await listPhotos(request.id) };
}

export async function getPhotoRequestByEvent(eventId: string): Promise<BookingPhotoRequest | null> {
  const { data, error } = await getSupabase()
    .from(REQUESTS)
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) fail("getPhotoRequestByEvent", error);
  return data ? mapRequest(data) : null;
}

/** Requests plus their photo counts for many bookings at once — the staff-facing views. */
export async function getPhotoRequestsForEvents(
  eventIds: string[],
): Promise<Map<string, { request: BookingPhotoRequest; photoCount: number }>> {
  const byEvent = new Map<string, { request: BookingPhotoRequest; photoCount: number }>();
  if (eventIds.length === 0) return byEvent;

  const sb = getSupabase();
  const requests: BookingPhotoRequest[] = [];
  // Chunked so a wide calendar range doesn't build an over-long request URL.
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data, error } = await sb
      .from(REQUESTS)
      .select("*")
      .in("event_id", eventIds.slice(i, i + 100));
    if (error) fail("getPhotoRequestsForEvents", error);
    requests.push(...(data ?? []).map(mapRequest));
  }
  if (requests.length === 0) return byEvent;

  const { data: photoRows, error: photoErr } = await sb
    .from(PHOTOS)
    .select("request_id")
    .in(
      "request_id",
      requests.map((r) => r.id),
    );
  if (photoErr) fail("getPhotoRequestsForEvents photos", photoErr);

  const counts = new Map<string, number>();
  for (const row of photoRows ?? []) {
    const key = String(row.request_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const request of requests) {
    byEvent.set(request.eventId, { request, photoCount: counts.get(request.id) ?? 0 });
  }
  return byEvent;
}

export async function listPhotos(requestId: string): Promise<BookingPhoto[]> {
  const { data, error } = await getSupabase()
    .from(PHOTOS)
    .select("*")
    .eq("request_id", requestId)
    .order("uploaded_at", { ascending: true });
  if (error) fail("listPhotos", error);
  return (data ?? []).map(mapPhoto);
}

export async function getPhotoById(photoId: string): Promise<BookingPhoto | null> {
  const { data, error } = await getSupabase()
    .from(PHOTOS)
    .select("*")
    .eq("id", photoId)
    .maybeSingle();
  if (error) fail("getPhotoById", error);
  return data ? mapPhoto(data) : null;
}

/** Creates the private bucket on first use, so the feature needs no manual dashboard step. */
async function ensureBucket(): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(PHOTO_BUCKET);
  if (data) return;
  const { error } = await sb.storage.createBucket(PHOTO_BUCKET, { public: false });
  // A parallel upload may have created it first; only a real failure matters.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`ensureBucket: ${error.message}`);
  }
}

export async function storePhoto(input: {
  request: BookingPhotoRequest;
  bytes: Uint8Array;
  contentType: (typeof ALLOWED_PHOTO_TYPES)[number];
}): Promise<BookingPhoto> {
  await ensureBucket();
  const sb = getSupabase();
  const photoId = crypto.randomUUID();
  const path = photoStoragePath(input.request.id, photoId, input.contentType);

  const { error: uploadError } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(path, input.bytes, { contentType: input.contentType, upsert: false });
  if (uploadError) throw new Error(`storePhoto upload: ${uploadError.message}`);

  const { data, error } = await sb
    .from(PHOTOS)
    .insert({
      id: photoId,
      request_id: input.request.id,
      storage_path: path,
      content_type: input.contentType,
      size_bytes: input.bytes.byteLength,
    })
    .select("*")
    .single();
  if (error) {
    // Don't leave a file behind that no row points at.
    await sb.storage
      .from(PHOTO_BUCKET)
      .remove([path])
      .catch(() => undefined);
    fail("storePhoto", error);
  }

  await setRequestStatus(input.request.id, "COMPLETED");
  return mapPhoto(data);
}

export async function deletePhoto(photo: BookingPhoto): Promise<void> {
  const sb = getSupabase();
  await sb.storage
    .from(PHOTO_BUCKET)
    .remove([photo.storagePath])
    .catch((err) => console.error("[photos] storage remove failed:", err));
  const { error } = await sb.from(PHOTOS).delete().eq("id", photo.id);
  if (error) fail("deletePhoto", error);

  // Back to pending when the client removed their last photo, so a required request is correctly
  // outstanding again.
  const remaining = await listPhotos(photo.requestId);
  if (remaining.length === 0) await setRequestStatus(photo.requestId, "PENDING");
}

export async function setRequestStatus(
  requestId: string,
  status: PhotoRequestStatus,
): Promise<void> {
  const { error } = await getSupabase()
    .from(REQUESTS)
    .update({
      status,
      completed_at: status === "COMPLETED" ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
  if (error) fail("setRequestStatus", error);
}

/** Closes an open request whose booking is gone. Photos are kept with the appointment record. */
export async function closePhotoRequestForEvent(eventId: string): Promise<void> {
  try {
    await getSupabase()
      .from(REQUESTS)
      .update({ status: "CANCELLED" })
      .eq("event_id", eventId)
      .in("status", ["PENDING", "SKIPPED"]);
  } catch (err) {
    console.error("[photos] closePhotoRequestForEvent failed:", err);
  }
}

/**
 * A short-lived URL for one photo. Issued only after the caller's permission has been checked —
 * the bucket itself is private, so there is no URL that works without going through here.
 */
export async function signedPhotoUrl(photo: BookingPhoto): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrl(photo.storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("[photos] signedPhotoUrl failed:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
