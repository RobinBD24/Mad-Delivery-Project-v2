import { cn } from "@/lib/utils";

export function Alert({
  tone,
  message,
  className,
}: {
  tone: "error" | "success" | "info" | "warning";
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  const tones = {
    error: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
    info: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25",
    warning: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  };
  return (
    <div className={cn("rounded-xl px-4 py-3 text-sm ring-1", tones[tone], className)} role="alert">
      {message}
    </div>
  );
}
