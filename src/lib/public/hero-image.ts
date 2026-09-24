import fs from "fs";
import path from "path";

/**
 * The clinic's own hero photograph, if one has been added.
 *
 * Drop a file at `public/hero.jpg` (or .png/.webp) and the landing page builds itself around the
 * image; with no file, it keeps the type-led composition rather than rendering a grey box where a
 * photo should be. That way the page never looks broken while a real photo is being sourced, and
 * adding one later needs no code change.
 *
 * Landscape works best — it is cropped to a tall frame on phones and a wide one on desktop.
 */

const CANDIDATES = ["hero.svg", "hero.jpg", "hero.jpeg", "hero.png", "hero.webp", "hero.avif"];

export function findHeroImage(): string | null {
  try {
    const publicDir = path.join(process.cwd(), "public");
    for (const name of CANDIDATES) {
      if (fs.existsSync(path.join(publicDir, name))) return `/${name}`;
    }
  } catch {
    // A read-only or missing public directory simply means no photo.
  }
  return null;
}
