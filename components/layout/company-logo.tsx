"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Renders the super-admin-configured global company logo (req #3). If the image
 * fails to load (deleted file, transient 404), it swaps to `fallback` so a
 * broken-image icon is never shown. A plain <img> is used deliberately —
 * runtime-uploaded media served via /api/uploads can be unreliable behind the
 * next/image optimizer; the native element with onError is the robust choice
 * (same pattern as UserAvatar).
 */
export function CompanyLogo({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={40}
      height={40}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
