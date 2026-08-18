"use client";

import Image from "next/image";
import { useState } from "react";

/** Food photo with an emoji fallback if the image is missing/broken. */
export function FoodImage({
  src,
  alt,
  fallback = "🍕",
  sizes,
  className,
}: {
  src: string;
  alt: string;
  fallback?: string;
  sizes?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-white/5 text-4xl ${className ?? ""}`}>
        {fallback}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? "(max-width: 640px) 50vw, 240px"}
      className={`object-cover ${className ?? ""}`}
      onError={() => setFailed(true)}
    />
  );
}
