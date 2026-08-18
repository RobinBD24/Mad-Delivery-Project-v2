function Bar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-surface-muted ${className}`}
      aria-hidden
    />
  );
}

export function DeliveryAreaListSkeleton() {
  return (
    <div role="status" aria-live="polite" data-testid="delivery-area-skeleton">
      <span className="sr-only">Loading</span>
      <div className="hidden divide-y divide-border-base md:block">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.5fr_1.2fr_.7fr_.8fr_.8fr_.7fr_1fr_1fr] items-center gap-4 px-5 py-4"
          >
            <Bar className="h-4 w-28" />
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-14" />
            <Bar className="h-4 w-16" />
            <Bar className="h-6 w-20 rounded-full" />
            <Bar className="h-6 w-16 rounded-full" />
            <Bar className="h-4 w-20" />
            <Bar className="h-8 w-24 justify-self-end" />
          </div>
        ))}
      </div>
      <div className="space-y-3 p-4 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="space-y-4 rounded-xl border border-border-base p-4"
          >
            <Bar className="h-5 w-36" />
            <Bar className="h-4 w-28" />
            <div className="grid grid-cols-2 gap-3">
              <Bar className="h-12 w-full" />
              <Bar className="h-12 w-full" />
            </div>
            <Bar className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
