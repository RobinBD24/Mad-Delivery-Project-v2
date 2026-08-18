import { NextResponse } from "next/server";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

export function created(data: unknown): NextResponse {
  return NextResponse.json(data as object, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * a standard pagination envelope. The frontend reads `results` for list pages
 * and mostly requests a large `page_size`, so a single page is returned.
 */
export function paginated<T>(
  items: T[],
  { count }: { page?: number; pageSize?: number; count?: number } = {},
): NextResponse {
  return NextResponse.json({
    count: count ?? items.length,
    next: null,
    previous: null,
    results: items,
  });
}

/** Parse ?page & ?page_size (sensible defaults: page 1, size 20, cap 200). */
export function pageParams(url: URL): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const raw = Number(url.searchParams.get("page_size") ?? "20") || 20;
  const pageSize = Math.min(Math.max(1, raw), 500);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
