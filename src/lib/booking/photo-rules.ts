/**
 * Pure rules for treatment-area photos: what a service asks for, and what a client may upload.
 * No I/O, so the parts that decide whether a booking is blocked or a file is accepted are
 * testable on their own.
 */

export type PhotoRequirement = "NONE" | "OPTIONAL" | "REQUIRED";

export const PHOTO_REQUIREMENT_LABELS: Record<PhotoRequirement, string> = {
  NONE: "Not required",
  OPTIONAL: "Optional",
  REQUIRED: "Required",
};

export type PhotoRequestStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED";

/** Formats accepted for upload. SVG is deliberately absent — it can carry script. */
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** More than a client needs for one appointment, and a cap on what one token can store. */
export const MAX_PHOTOS_PER_REQUEST = 5;

export function parsePhotoRequirement(raw: unknown): PhotoRequirement {
  return raw === "OPTIONAL" || raw === "REQUIRED" ? raw : "NONE";
}

/** A request is only created for services that actually ask for a photo. */
export function needsPhotoRequest(requirement: PhotoRequirement): boolean {
  return requirement === "OPTIONAL" || requirement === "REQUIRED";
}

/**
 * Whether the appointment is still missing something the clinic requires. Optional requests never
 * count as missing, however the client leaves them — that is what makes them optional.
 */
export function isPhotoOutstanding(
  requirement: PhotoRequirement,
  status: PhotoRequestStatus,
  photoCount: number,
): boolean {
  if (requirement !== "REQUIRED") return false;
  if (status === "CANCELLED") return false;
  return photoCount === 0;
}

/** What the client is asked to photograph — the clinic's own wording, or a sensible fallback. */
export function photoInstructions(instructions: string | null, serviceName: string): string {
  const custom = instructions?.trim();
  if (custom) return custom;
  return `Please upload a clear photo of the area you'd like treated for your ${serviceName} appointment.`;
}

export type FileCheck = { ok: true } | { ok: false; error: string };

/**
 * Checks a file's declared type and size before it is read. The magic-byte check in
 * `sniffImageType` is what actually decides the stored type — a filename and a declared
 * content type are both caller-supplied and can lie.
 */
export function checkUploadedFile(file: { type: string; size: number }): FileCheck {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    return { ok: false, error: "Please upload a JPEG, PNG or WebP photo." };
  }
  if (file.size <= 0) return { ok: false, error: "That file appears to be empty." };
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "That photo is over 10MB — please upload a smaller one." };
  }
  return { ok: true };
}

/**
 * The real image type, read from the file's first bytes. Returns null for anything that isn't one
 * of the accepted formats, whatever the upload claimed it was.
 */
export function sniffImageType(bytes: Uint8Array): (typeof ALLOWED_PHOTO_TYPES)[number] | null {
  if (bytes.length < 12) return null;
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // "RIFF" .... "WEBP"
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS: Record<(typeof ALLOWED_PHOTO_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Where a photo is stored. Built from ids only — never from the client's filename, which would
 * otherwise let an upload steer its own path — and namespaced per request so one token's files
 * can never collide with or overwrite another's.
 */
export function photoStoragePath(
  requestId: string,
  photoId: string,
  contentType: (typeof ALLOWED_PHOTO_TYPES)[number],
): string {
  return `requests/${requestId}/${photoId}.${EXTENSIONS[contentType]}`;
}
