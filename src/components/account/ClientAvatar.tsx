"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The client's profile picture, or their initial when they have none (or it fails to load).
 * `version` is when the picture last changed — both the "is there one" signal and a cache-buster,
 * so a replaced picture shows immediately instead of the browser's cached copy.
 */
export function ClientAvatar({
  name,
  version,
  className,
}: {
  name: string;
  version: number | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [version]);

  const initial = name.trim()[0]?.toUpperCase() || "?";
  const showImage = version !== null && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white font-medium text-primary",
        className,
      )}
    >
      {showImage ? (
        <img
          src={`/api/account/avatar?v=${version}`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
