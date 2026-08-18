import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import { makeFormatters } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** Link-based pagination driven by the `page` search param. */
export function Pagination({
  count,
  page,
  pageSize = 20,
  basePath,
  searchParams = {},
  locale = "bn",
}: {
  count: number;
  page: number;
  pageSize?: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  locale?: Locale;
}) {
  const fmt = makeFormatters(locale);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (totalPages <= 1) return null;

  function href(p: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav
      className="flex items-center justify-center gap-1.5 px-4 py-4"
      aria-label={locale === "bn" ? "পেজিনেশন" : "Pagination"}
    >
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1] !== p - 1 ? <span className="text-fg-subtle">…</span> : null}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "flex size-10 items-center justify-center rounded-xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              p === page
                ? "bg-brand-500 text-white"
                : "text-fg-muted hover:bg-surface-hover",
            )}
          >
            {fmt.num(p)}
          </Link>
        </span>
      ))}
    </nav>
  );
}
