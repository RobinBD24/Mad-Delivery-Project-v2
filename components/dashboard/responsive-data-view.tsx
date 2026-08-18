import type { Key, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ResponsiveDataView<T>({
  items,
  desktop,
  mobile,
  getKey,
  mobileClassName,
}: {
  items: T[];
  desktop: (items: T[]) => ReactNode;
  mobile: (item: T) => ReactNode;
  getKey: (item: T) => Key;
  mobileClassName?: string;
}) {
  return (
    <>
      <div data-testid="responsive-data-desktop" className="hidden min-w-0 md:block">
        {desktop(items)}
      </div>
      <div
        data-testid="responsive-data-mobile"
        className={cn("grid min-w-0 gap-3 p-3 md:hidden", mobileClassName)}
      >
        {items.map((item) => <div key={getKey(item)} className="min-w-0">{mobile(item)}</div>)}
      </div>
    </>
  );
}
