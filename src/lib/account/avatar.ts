import { getSupabase } from "@/lib/supabase";

/**
 * A client's profile picture.
 *
 * One file per client in a PRIVATE Storage bucket, keyed by the client id (uploading again simply
 * replaces it). Nothing is ever served from a public URL: the browser asks /api/account/avatar,
 * which checks the session and redirects to a short-lived signed URL. The bucket is created on
 * first use, so the feature needs no dashboard step, and this database stores no path at all —
 * whether a picture exists is answered by the bucket itself.
 */

export const AVATAR_BUCKET = "client-avatars";
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

/** Confirms the bytes really are the image type claimed — a filename or a Content-Type header alone
 * proves nothing, and this is a file a stranger's browser may later be asked to display. */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function ensureBucket(): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(AVATAR_BUCKET);
  if (data) return;
  const { error } = await sb.storage.createBucket(AVATAR_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`ensureBucket: ${error.message}`);
  }
}

/** When the client's picture was last changed (epoch ms), or null if they have none. Used both to
 * decide whether to show an image and as a cache-buster on its URL. */
export async function getAvatarVersion(clientId: string): Promise<number | null> {
  try {
    const { data, error } = await getSupabase()
      .storage.from(AVATAR_BUCKET)
      .list("", { search: clientId, limit: 5 });
    if (error || !data) return null;
    const file = data.find((f) => f.name === clientId);
    if (!file) return null;
    const stamp = file.updated_at ?? file.created_at;
    return stamp ? new Date(stamp).getTime() : 1;
  } catch {
    return null;
  }
}

export async function storeAvatar(clientId: string, bytes: Uint8Array, type: AvatarType) {
  await ensureBucket();
  const { error } = await getSupabase()
    .storage.from(AVATAR_BUCKET)
    .upload(clientId, bytes, { contentType: type, upsert: true, cacheControl: "300" });
  if (error) throw new Error(`storeAvatar: ${error.message}`);
}

export async function removeAvatar(clientId: string): Promise<void> {
  const { error } = await getSupabase().storage.from(AVATAR_BUCKET).remove([clientId]);
  if (error) throw new Error(`removeAvatar: ${error.message}`);
}

export async function signedAvatarUrl(clientId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from(AVATAR_BUCKET)
    .createSignedUrl(clientId, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
