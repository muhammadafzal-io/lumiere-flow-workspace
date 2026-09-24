"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useAccountIdentity } from "@/lib/account/use-account-context";
import { ClientAvatar } from "@/components/account/ClientAvatar";
import { AccountError } from "@/components/account/AccountUI";
import { Button } from "@/components/ui/button";

/**
 * Upload, replace or remove the client's profile picture.
 *
 * The chosen image is centre-cropped to a square and shrunk to 512px in the browser before it is
 * sent, so a 12-megapixel phone photo becomes a small, fast file and the server's size limit is
 * rarely an issue. The server still re-checks the type and size — this only makes the common case
 * easy.
 */

const SIZE = 512;

async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
  );
}

export function AvatarEditor({ name }: { name: string }) {
  const identity = useAccountIdentity();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const version = identity?.avatarVersion ?? null;

  const upload = async (file: File) => {
    setBusy("upload");
    setError(null);
    try {
      // Cropping is a nicety; if the browser can't decode the file, send it as is and let the
      // server decide whether it's a usable picture.
      let payload: Blob = file;
      let filename = file.name;
      try {
        payload = await toSquareJpeg(file);
        filename = "avatar.jpg";
      } catch {
        /* fall through with the original file */
      }
      const form = new FormData();
      form.append("file", payload, filename);
      const res = await fetch("/api/account/avatar", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't save that picture.");
      identity?.setAvatarVersion(json.version ?? Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save that picture.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "We couldn't remove that picture.");
      }
      identity?.setAvatarVersion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't remove that picture.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-4">
        <ClientAvatar
          name={name}
          version={version}
          className="h-20 w-20 bg-primary font-serif text-2xl text-primary-foreground shadow-sm ring-4 ring-white"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a profile picture"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === "upload" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="mr-1.5 h-3.5 w-3.5" />
            )}
            {version !== null ? "Change photo" : "Upload photo"}
          </Button>
          {version !== null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy !== null}
              onClick={remove}
            >
              {busy === "remove" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Cropped to a square.</p>
      {error && <AccountError message={error} />}
    </div>
  );
}
