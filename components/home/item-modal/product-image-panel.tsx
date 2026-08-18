"use client";

import { FoodImage } from "@/components/home/food-image";

/**
 * Left photo panel (desktop) / top image (mobile sheet): full-bleed
 * object-cover photo with the product description in a dark muted-italic
 * footer strip, as in the reference design.
 */
export function ProductImagePanel({
  image,
  name,
  description,
}: {
  image: string;
  name: string;
  description: string;
}) {
  return (
    <div className="flex h-50 w-full shrink-0 flex-col overflow-hidden bg-[#0E0E15] sm:h-auto sm:w-1/2 sm:self-stretch sm:rounded-l-[20px]">
      <div className="relative min-h-50 w-full flex-1 sm:min-h-100">
        <FoodImage src={image} alt={name} sizes="(max-width: 640px) 100vw, 480px" />
      </div>
      <p className="hidden shrink-0 border-t border-white/8 bg-[#0E0E15] px-4 py-2.5 text-[0.72rem] italic leading-5 text-[#a0a0b0] sm:block">
        {description}
      </p>
    </div>
  );
}
