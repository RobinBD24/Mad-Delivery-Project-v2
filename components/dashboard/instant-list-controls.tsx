"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Icon } from "@/components/layout/icons";
import { FIELD_CLASS, SELECT_EXTRA_CLASS } from "@/components/ui/field-class";
import { listHref, type RawSearchParams } from "@/lib/http/list-params";
import { cn } from "@/lib/utils";

/**
 * List controls that apply IMMEDIATELY — no Apply button, no Search button.
 *
 * Deliberately separate from the server-rendered `list-controls.tsx`, which
 * seven other list pages still use. Those are plain forms and links: they work
 * without JavaScript and cost no hydration. Changing them in place would alter
 * every one of those pages, so this is an opt-in client variant for the pages
 * that want instant filtering.
 *
 * State still lives entirely in the URL. Navigation uses `router.replace` with
 * `scroll: false`, so the list updates in place: no full document load, Back and
 * Forward still work, and the URL stays shareable.
 */

/** Debounce for the search box. Long enough to skip intermediate keystrokes. */
export const SEARCH_DEBOUNCE_MS = 350;

export function InstantSearch({
  basePath,
  searchParams,
  value,
  placeholder,
  label,
  clearLabel,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  /** The term the server rendered with — the source of truth on load. */
  value: string;
  placeholder: string;
  label: string;
  clearLabel: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(value);
  const [pending, startTransition] = useTransition();

  // Keep the box in step when the URL changes from elsewhere (Back/Forward, a
  // filter chip removing `search`, "Clear all"). Adjusted DURING RENDER rather
  // than in an effect: React re-renders immediately with the new state, so the
  // input never commits a frame showing the previous term.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setTerm(value);
  }

  useEffect(() => {
    // Already what the server rendered — also the first-render case, since
    // `term` is initialised from `value`.
    if (term === value) return;

    const id = setTimeout(() => {
      const next = term.trim();
      startTransition(() => {
        router.replace(
          // Empty search drops the parameter entirely rather than leaving
          // `?search=`. Any change resets to page 1 — page 4 of the old result
          // set is meaningless for a new one.
          listHref(basePath, searchParams, { search: next || undefined, page: undefined }),
          { scroll: false },
        );
      });
    }, SEARCH_DEBOUNCE_MS);
    // THE stale-request guard. The effect re-runs on every keystroke and this
    // cleanup cancels the pending timer, so a navigation queued for an older
    // term can never fire after a newer one. Combined with `router.replace`,
    // which supersedes the in-flight request for the same route, a slow earlier
    // response cannot overwrite a newer result.
    return () => clearTimeout(id);
    // `searchParams`/`router` are stable for a given render of the server page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, value, basePath]);

  const clear = () => setTerm("");

  return (
    <div className="relative min-w-0 flex-1" aria-busy={pending}>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        type="text"
        inputMode="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        data-testid="instant-search"
        // `type="text"`, not `type="search"`: the native clear affordance sits
        // exactly where our own clear button goes, and the two overlapped.
        className={cn(FIELD_CLASS, "pl-9", term ? "pr-11" : "pr-3")}
      />
      {pending ? (
        // Subtle, in-place: the table keeps rendering the previous rows while
        // the transition resolves, so nothing flashes "No products".
        <span
          data-testid="instant-search-pending"
          className="absolute right-11 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-border-strong border-t-brand-500"
        />
      ) : null}
      {term ? (
        <button
          type="button"
          onClick={clear}
          aria-label={clearLabel}
          data-testid="instant-search-clear"
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Icon name="x" className="size-4" />
        </button>
      ) : null}
      {/* Announced politely so a screen reader hears that results are updating,
          without stealing focus from the input the user is still typing in. */}
      <span aria-live="polite" className="sr-only">
        {pending ? label : ""}
      </span>
    </div>
  );
}

export function InstantFilterSelect({
  basePath,
  searchParams,
  name,
  label,
  value,
  options,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        value={value}
        aria-label={label}
        data-testid={`instant-filter-${name}`}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => {
            router.replace(
              // "" means "All" — drop the parameter instead of persisting an
              // empty one. Changing a filter always returns to page 1.
              listHref(basePath, searchParams, { [name]: next || undefined, page: undefined }),
              { scroll: false },
            );
          });
        }}
        className={cn(FIELD_CLASS, SELECT_EXTRA_CLASS, "h-11 min-w-36 py-0 text-sm")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
