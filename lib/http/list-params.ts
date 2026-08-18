/**
 * Server-side list controls shared by every authenticated list page.
 *
 * Search, filters, sorting and paging all live in the URL, so the browser's
 * Back/Forward buttons work, a filtered view can be linked, and a summary card
 * can point at a pre-filtered list. Everything is parsed and CLAMPED here —
 * `sort` in particular is resolved against an explicit whitelist, so a crafted
 * query string can never reach Prisma's `orderBy`.
 */

/**
 * Rows per page for every server-paginated list. 10 keeps a page readable on a
 * laptop without scrolling past the pagination controls, and a page that needs a
 * different size passes `defaultPageSize` explicitly rather than redefining the
 * shared default.
 */
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/**
 * Rows per page on the Super Admin product list. Its own constant rather than
 * the shared default (10): the product table is the densest list in the admin
 * and 15 fills a laptop viewport without pushing the pagination off-screen.
 * Every other list keeps DEFAULT_PAGE_SIZE. Lives here rather than in the page
 * module because a Next page file may only export its own reserved names.
 */
export const PRODUCTS_PAGE_SIZE = 15;

export type SortDirection = "asc" | "desc";

export interface ListParams<TSort extends string = string> {
  page: number;
  pageSize: number;
  /** Prisma `skip` for the resolved page. */
  skip: number;
  /** Prisma `take` for the resolved page. */
  take: number;
  /** Trimmed, collapsed search term ("" when absent). */
  search: string;
  sort: TSort;
  direction: SortDirection;
}

/** Raw `searchParams` as Next hands them to a page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a possibly-repeated query parameter. */
export function param(sp: RawSearchParams, key: string): string {
  const value = sp[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

/** A query value constrained to a known set — anything else becomes "". */
export function enumParam<T extends string>(
  sp: RawSearchParams,
  key: string,
  allowed: readonly T[],
): T | "" {
  const raw = param(sp, key);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : "";
}

/** A `YYYY-MM-DD` query value, or "" when absent/malformed. */
export function dateParam(sp: RawSearchParams, key: string): string {
  const raw = param(sp, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return "";
  return raw;
}

export function parseListParams<TSort extends string>(
  sp: RawSearchParams,
  options: {
    /** The ONLY fields that may be sorted on. */
    sortable: readonly TSort[];
    defaultSort: TSort;
    defaultDirection?: SortDirection;
    defaultPageSize?: number;
  },
): ListParams<TSort> {
  const { sortable, defaultSort, defaultDirection = "desc" } = options;

  const pageRaw = Number.parseInt(param(sp, "page"), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const sizeRaw = Number.parseInt(param(sp, "pageSize"), 10);
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw > 0
      ? Math.min(sizeRaw, MAX_PAGE_SIZE)
      : (options.defaultPageSize ?? DEFAULT_PAGE_SIZE);

  // Collapse runs of whitespace so "  ali   khan " matches like "ali khan".
  const search = param(sp, "search").replace(/\s+/g, " ");

  const sortRaw = param(sp, "sort");
  const sort = (sortable as readonly string[]).includes(sortRaw)
    ? (sortRaw as TSort)
    : defaultSort;

  const dirRaw = param(sp, "direction");
  const direction: SortDirection =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : defaultDirection;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search, sort, direction };
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** 1-based index of the first row shown (0 when the list is empty). */
  from: number;
  /** 1-based index of the last row shown (0 when the list is empty). */
  to: number;
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A page beyond the end (e.g. after the last row on it was deleted) reports
  // the last real page rather than an empty, invalid one.
  const current = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  return {
    total,
    page: current,
    pageSize,
    totalPages,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
    from,
    to,
  };
}

/**
 * Build a href for the same list with some parameters changed.
 * Empty/undefined values are dropped, and `page` resets whenever a filter that
 * changes the result set is altered — otherwise page 5 of an old filter could
 * render as an empty page of a new one.
 */
export function listHref(
  basePath: string,
  current: RawSearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === "string" && raw !== "") params.set(key, raw);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  if (!("page" in changes)) params.delete("page");
  if (params.get("page") === "1") params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** True when any list control other than paging is active. */
export function hasActiveFilters(sp: RawSearchParams, keys: readonly string[]): boolean {
  return keys.some((key) => param(sp, key) !== "");
}
