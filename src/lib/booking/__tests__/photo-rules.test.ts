import { describe, expect, it } from "vitest";
import {
  checkUploadedFile,
  isPhotoOutstanding,
  MAX_PHOTO_BYTES,
  needsPhotoRequest,
  parsePhotoRequirement,
  photoInstructions,
  photoStoragePath,
  sniffImageType,
} from "../photo-rules";

const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = () =>
  Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0]);

describe("parsePhotoRequirement", () => {
  it("defaults anything unrecognised to not required", () => {
    for (const raw of [undefined, null, "", "yes", "true", 1]) {
      expect(parsePhotoRequirement(raw)).toBe("NONE");
    }
    expect(parsePhotoRequirement("OPTIONAL")).toBe("OPTIONAL");
    expect(parsePhotoRequirement("REQUIRED")).toBe("REQUIRED");
  });
});

describe("needsPhotoRequest", () => {
  it("only asks for a photo when the service is configured to", () => {
    expect(needsPhotoRequest("NONE")).toBe(false);
    expect(needsPhotoRequest("OPTIONAL")).toBe(true);
    expect(needsPhotoRequest("REQUIRED")).toBe(true);
  });
});

describe("isPhotoOutstanding", () => {
  it("flags a required photo that hasn't arrived", () => {
    expect(isPhotoOutstanding("REQUIRED", "PENDING", 0)).toBe(true);
  });

  it("clears once a photo is uploaded", () => {
    expect(isPhotoOutstanding("REQUIRED", "COMPLETED", 1)).toBe(false);
  });

  it("never blocks on an optional photo, however it was left", () => {
    for (const status of ["PENDING", "SKIPPED", "COMPLETED"] as const) {
      expect(isPhotoOutstanding("OPTIONAL", status, 0)).toBe(false);
    }
  });

  it("stops mattering once the booking is gone", () => {
    expect(isPhotoOutstanding("REQUIRED", "CANCELLED", 0)).toBe(false);
  });

  it("is irrelevant for services that never asked", () => {
    expect(isPhotoOutstanding("NONE", "PENDING", 0)).toBe(false);
  });
});

describe("photoInstructions", () => {
  it("uses the clinic's own wording when set", () => {
    expect(photoInstructions("Show us both cheeks, no makeup.", "Botox")).toBe(
      "Show us both cheeks, no makeup.",
    );
  });

  it("falls back to generic wording naming the service", () => {
    expect(photoInstructions(null, "Botox")).toContain("Botox");
    expect(photoInstructions("   ", "Botox")).toContain("Botox");
  });
});

describe("checkUploadedFile", () => {
  it("accepts the image types the clinic can open", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkUploadedFile({ type, size: 1_000 })).toEqual({ ok: true });
    }
  });

  it("rejects other types, including SVG", () => {
    for (const type of ["image/svg+xml", "application/pdf", "text/html", ""]) {
      expect(checkUploadedFile({ type, size: 1_000 }).ok, type).toBe(false);
    }
  });

  it("rejects an empty file and one over the limit", () => {
    expect(checkUploadedFile({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(checkUploadedFile({ type: "image/png", size: MAX_PHOTO_BYTES + 1 }).ok).toBe(false);
    expect(checkUploadedFile({ type: "image/png", size: MAX_PHOTO_BYTES })).toEqual({ ok: true });
  });
});

describe("sniffImageType", () => {
  it("identifies real image bytes", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(webp())).toBe("image/webp");
  });

  it("rejects a file that only claims to be an image", () => {
    // An SVG or a script renamed to .png reaches here with an image content type; the bytes don't.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a........"))).toBeNull();
    expect(sniffImageType(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

describe("photoStoragePath", () => {
  it("builds a path from ids only, never the client's filename", () => {
    expect(photoStoragePath("req-1", "photo-1", "image/jpeg")).toBe("requests/req-1/photo-1.jpg");
    expect(photoStoragePath("req-1", "photo-2", "image/webp")).toBe("requests/req-1/photo-2.webp");
  });

  it("keeps each request's files in their own folder", () => {
    const a = photoStoragePath("req-a", "same-id", "image/png");
    const b = photoStoragePath("req-b", "same-id", "image/png");
    expect(a).not.toBe(b);
  });
});
