import "server-only";

export type SummaryResult<T> =
  | { ok: true; data: T }
  | { ok: false; reference?: string };

export async function loadPageSummary<T>(
  loader: () => Promise<T>,
): Promise<SummaryResult<T>> {
  try {
    return { ok: true, data: await loader() };
  } catch (error) {
    const reference =
      error && typeof error === "object" && "digest" in error
        ? String((error as { digest?: unknown }).digest ?? "") || undefined
        : undefined;
    return { ok: false, reference };
  }
}
