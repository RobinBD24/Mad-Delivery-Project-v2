import { cn } from "@/lib/utils";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-5 animate-spin rounded-full border-2 border-border-strong border-t-brand-500",
        className,
      )}
      aria-label={label}
    />
  );
}

// `label` is passed translated by callers (e.g. loading.tsx); the default is a
// neutral fallback only used if a caller omits it.
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-fg-muted">
      <Spinner className="size-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
