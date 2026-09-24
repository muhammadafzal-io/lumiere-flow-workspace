import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import {
  AVATAR_MAX_BYTES,
  getAvatarVersion,
  removeAvatar,
  signedAvatarUrl,
  sniffImageType,
  storeAvatar,
} from "@/lib/account/avatar";

export const dynamic = "force-dynamic";

/** The picture itself: session-checked, then a redirect to a short-lived signed URL. */
export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  const url = await signedAvatarUrl(check.customer.id);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Upload or replace. Scoped to the session's own client — never an id from the request. */
export async function POST(req: NextRequest) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a picture to upload." }, { status: 400 });
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json({ error: "That picture is too large (3 MB max)." }, { status: 413 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Trust the bytes, not the filename or the declared type.
    const type = sniffImageType(bytes);
    if (!type) {
      return NextResponse.json(
        { error: "Please upload a JPG, PNG or WebP picture." },
        { status: 415 },
      );
    }
    await storeAvatar(check.customer.id, bytes, type);
    return NextResponse.json({
      ok: true,
      version: (await getAvatarVersion(check.customer.id)) ?? Date.now(),
    });
  } catch (err) {
    console.error("POST /api/account/avatar error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We couldn't save that picture." }, { status: 500 });
  }
}

export async function DELETE() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  try {
    await removeAvatar(check.customer.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/account/avatar error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We couldn't remove that picture." }, { status: 500 });
  }
}
