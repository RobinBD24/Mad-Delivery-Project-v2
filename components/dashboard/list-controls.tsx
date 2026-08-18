import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { FIELD_CLASS, SELECT_EXTRA_CLASS } from "@/components/ui/field-class";
import { listHref, type PageMeta, type RawSearchParams } from "@/lib/http/list-params";
import { cn } from "@/lib/utils";

/**
 * Server-rendered list controls shared by every authenticated list page.
 *
 * All state lives in the URL, so these are plain links and a GET form — no
 * client component, no hydration cost, and Back/Forward behave correctly.
 */

/**
 * Search box. A GET form means it works without JavaScript and lands on a
 * shareable URL. Hidden inputs carry the other active parameters so searching
 * does not silently drop the current filters or sort.
 */
export function ListSearch({
  basePath,
  searchParams,
  value,
  placeholder,
  label,
  clearLabel,
  submitLabel,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  value: string;
  placeholder: string;
  label: string;
  clearLabel: string;
  submitLabel: string;
}) {
  const carried = Object.entries(searchParams).filter(([key]) => key !== "search" && key !== "page");

  return (
    <form action={basePath} method="get" className="flex min-w-0 items-center gap-2">
      {carried.map(([key, raw]) => {
        const v = Array.isArray(raw) ? raw[0] : raw;
        return v ? <input key={key} type="hidden" name={key} value={v} /> : null;
      })}
      <span className="relative min-w-0 flex-1">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="search"
          name="search"
          defaultValue={value}
          placeholder={placeholder}
          aria-label={label}
          className={cn(FIELD_CLASS, "pl-9")}
        />
      </span>
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {submitLabel}
      </button>
      {value ? (
        <Link
          href={listHref(basePath, searchParams, { search: undefined })}
          className="inline-flex h-11 shrink-0 items-center rounded-xl border border-border-strong px-3 text-sm font-medium text-fg-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {clearLabel}
        </Link>
      ) : null}
    </form>
  );
}

/**
 * A filter dropdown that navigates on change. It is a real `<select>` inside a
 * GET form with a no-JS submit fallback, so it stays keyboard accessible and
 * its options inherit the themed styling that keeps them readable in dark mode.
 */
export function ListFilterSelect({
  basePath,
  searchParams,
  name,
  label,
  value,
  options,
  applyLabel,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  applyLabel: string;
}) {
  const carried = Object.entries(searchParams).filter(([key]) => key !== name && key !== "page");

  return (
    <form action={basePath} method="get" className="flex min-w-0 items-center gap-1.5">
      {carried.map(([key, raw]) => {
        const v = Array.isArray(raw) ? raw[0] : raw;
        return v ? <input key={key} type="hidden" name={key} value={v} /> : null;
      })}
      <label className="min-w-0">
        <span className="sr-only">{label}</span>
        <select
          name={name}
          defaultValue={value}
          aria-label={label}
          className={cn(FIELD_CLASS, SELECT_EXTRA_CLASS, "h-11 min-w-36 py-0 text-sm")}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-fg-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {applyLabel}
      </button>
    </form>
  );
}

/**
 * "Showing 21–40 of 137" plus Previous/Next and nearby page numbers.
 *
 * Every link is built from the CURRENT query string, so paging never drops the
 * active search, filters or sort.
 */
export function ListPagination({
  basePath,
  searchParams,
  meta,
  labels,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  meta: PageMeta;
  labels: {
    showing: string;
    previous: string;
    next: string;
    pagination: string;
  };
}) {
  const pages = Array.from({ length: meta.totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1,
  );

  const step = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

  return (
    <nav
      aria-label={labels.pagination}
      data-testid="list-pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border-base px-4 py-3.5"
    >
      <p className="text-xs font-medium text-fg-muted" data-testid="list-results-range">
        {labels.showing}
      </p>

      {meta.totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta.hasPrevious ? (
            <Link
              href={listHref(basePath, searchParams, { page: meta.page - 1 })}
              className={cn(step, "border border-border-strong text-fg-base hover:bg-surface-hover")}
              rel="prev"
            >
              {labels.previous}
            </Link>
          ) : (
            <span className={cn(step, "border border-border-base text-fg-subtle opacity-50")} aria-disabled="true">
              {labels.previous}
            </span>
          )}

          {pages.map((p, i) => (
            <span key={p} className="flex items-center gap-1.5">
              {i > 0 && pages[i - 1] !== p - 1 ? <span className="text-fg-subtle">…</span> : null}
              {p === meta.page ? (
                <span aria-current="page" className={cn(step, "bg-brand-500 text-white")}>
                  {p}
                </span>
              ) : (
                <Link
                  href={listHref(basePath, searchParams, { page: p })}
                  className={cn(step, "border border-border-base text-fg-muted hover:bg-surface-hover")}
                >
                  {p}
                </Link>
              )}
            </span>
          ))}

          {meta.hasNext ? (
            <Link
              href={listHref(basePath, searchParams, { page: meta.page + 1 })}
              className={cn(step, "border border-border-strong text-fg-base hover:bg-surface-hover")}
              rel="next"
            >
              {labels.next}
            </Link>
          ) : (
            <span className={cn(step, "border border-border-base text-fg-subtle opacity-50")} aria-disabled="true">
              {labels.next}
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
