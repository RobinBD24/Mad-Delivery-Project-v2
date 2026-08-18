"use client";

import { useState } from "react";

import { cn, mediaUrl } from "@/lib/utils";

/**
 * Single source of truth for rendering a user's profile photo anywhere in the
 * app (topbar, sidebar, profile form, user detail, tables…).
 *
 * Uses a plain <img> on purpose: runtime-uploaded media can be unreliable behind
 * the next/image optimizer, which is what left broken avatars in the chrome.
 * A native <img> loads the media directly and falls back to initials via
 * `onError`, so a broken/expired URL never shows the broken-image glyph.
 *
 * Pass `photo` (raw backend value) + `version` (owner's `updated_at`) for
 * cache-busting; `mediaUrl` normalizes every URL shape.
 */
export function UserAvatar({
  name,
  photo,
  version,
  className,
  fallbackClassName,
}: {
  name?: string | null;
  photo?: string | null;
  version?: string | null;
  /** Wrapper classes — set the size/shape here, e.g. "size-9". */
  className?: string;
  /** Extra classes for the initials fallback (bg/text color). */
  fallbackClassName?: string;
}) {
  const src = mediaUrl(photo, version);
  // Track which src failed to load; when `src` changes (new upload / cache-bust)
  // it no longer matches, so the new image is attempted again — no effect needed.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();
  const showImage = src && failedSrc !== src;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700",
        !showImage && fallbackClassName,
        className,
      )}
      aria-label={name ?? undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name ?? ""}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}
