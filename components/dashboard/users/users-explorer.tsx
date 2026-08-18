"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { UserRowActions } from "./user-row-actions";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { RoleBadge, UserAccountStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, Td } from "@/components/ui/table";
import { ROLES, USER_LIST_STATUS_FILTERS } from "@/lib/constants/enums";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { Paginated, User } from "@/types";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

/** Translation key for each `?status=` option (approval + activation + blocked). */
const STATUS_OPTION_KEYS: Record<(typeof USER_LIST_STATUS_FILTERS)[number], string> = {
  pending: "userStatus.pending",
  approved: "userStatus.approved",
  rejected: "userStatus.rejected",
  active: "common.active",
  inactive: "common.inactive",
  blocked: "users.statusBlocked",
};

function normalizeRole(value: string | null): string {
  return value && (ROLES as string[]).includes(value) ? value : "";
}

function normalizeStatus(value: string | null): string {
  return value && (USER_LIST_STATUS_FILTERS as readonly string[]).includes(value) ? value : "";
}

/** Query string for the toolbar state; defaults are omitted entirely. */
function buildQuery(state: { search: string; role: string; status: string; page: number }): string {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.role) params.set("role", state.role);
  if (state.status) params.set("status", state.status);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

function SelectChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Client-side search/filter/table for the Super Admin user list.
 *
 * - URL query params are the source of truth (search/role/status/page).
 * - Typing is debounced (300ms) then committed with history.replaceState;
 *   dropdowns/pagination use pushState so Back/Forward walk filter states.
 *   Both integrate with useSearchParams without a server round-trip.
 * - Results are fetched from /api/auth/users; an AbortController plus a
 *   sequence counter guarantee stale responses never overwrite newer ones.
 */
export function UsersExplorer({
  initial,
  initialQuery,
}: {
  initial: Paginated<User>;
  /** buildQuery() string the server rendered `initial` for. */
  initialQuery: string;
}) {
  const { t, fmt, locale } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const role = normalizeRole(searchParams.get("role"));
  const status = normalizeStatus(searchParams.get("status"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const hasFilters = Boolean(search || role || status);

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  // Query string the currently displayed `data` belongs to. Starting from the
  // server-provided value (instead of blindly skipping the first fetch) keeps
  // Back/Forward correct: Next may remount this page from a cached RSC payload
  // whose data no longer matches the restored URL.
  const dataQueryRef = useRef(initialQuery);
  const committedSearchRef = useRef<string | null>(null);

  function applyUrl(next: { search?: string; role?: string; status?: string; page?: number }, mode: "push" | "replace") {
    const qs = buildQuery({
      search: next.search ?? search,
      role: next.role ?? role,
      status: next.status ?? status,
      page: next.page ?? 1, // any filter change resets pagination
    });
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  // Debounced commit of the search input into the URL (clearing is instant).
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => {
      committedSearchRef.current = searchInput;
      applyUrl({ search: searchInput, page: 1 }, "replace");
    }, searchInput === "" ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search, role, status, pathname]);

  // External URL change (Back/Forward, shared link) → sync the input, but not
  // when the change is the echo of our own debounced commit.
  useEffect(() => {
    if (committedSearchRef.current === search) {
      committedSearchRef.current = null;
      return;
    }
    setSearchInput(search);
  }, [search]);

  // Fetch whenever the URL-held query changes. AbortController cancels the
  // in-flight request; the sequence counter ignores late arrivals.
  useEffect(() => {
    const qs = buildQuery({ search: search.trim(), role, status, page });
    if (qs === dataQueryRef.current) return; // displayed data already matches the URL
    const controller = new AbortController();
    const seq = ++seqRef.current;
    setLoading(true);

    fetch(`/api/auth/users${qs ? `?${qs}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Paginated<User>>;
      })
      .then((json) => {
        if (seq !== seqRef.current) return;
        dataQueryRef.current = qs;
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        if (seq !== seqRef.current) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [search, role, status, page]);

  function clearFilters() {
    committedSearchRef.current = "";
    setSearchInput("");
    window.history.pushState(null, "", pathname);
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-testid="users-toolbar">
        <div className="relative w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("users.searchPlaceholder")}
            aria-label={t("users.searchPlaceholder")}
            className="pr-10"
            data-testid="users-search"
          />
          {loading ? (
            <span
              role="status"
              aria-live="polite"
              aria-label={t("users.searching")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              data-testid="users-searching"
            >
              <Spinner className="size-4" label={t("users.searching")} />
            </span>
          ) : null}
        </div>

        <div className="relative w-full sm:w-44">
          <Select
            value={role}
            onChange={(e) => applyUrl({ role: e.target.value, page: 1 }, "push")}
            aria-label={t("users.roleFilter")}
            data-testid="users-role-filter"
          >
            <option value="">{t("users.allRoles")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
          <SelectChevron />
        </div>

        <div className="relative w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => applyUrl({ status: e.target.value, page: 1 }, "push")}
            aria-label={t("users.statusFilter")}
            data-testid="users-status-filter"
          >
            <option value="">{t("users.allStatuses")}</option>
            {USER_LIST_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_OPTION_KEYS[s])}
              </option>
            ))}
          </Select>
          <SelectChevron />
        </div>

        {hasFilters ? (
          <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto" data-testid="users-clear-filters">
            {t("users.clearFilters")}
          </Button>
        ) : null}
      </div>

      <Card>
        <div aria-busy={loading} className={cn("transition-opacity", loading && "opacity-60")}>
          {data.results.length === 0 ? (
            <EmptyState
              title={t("users.noUsersFound")}
              description={t("users.noUsersFoundDescription")}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    {t("users.clearFilters")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ResponsiveDataView
              items={data.results}
              getKey={(user) => user.id}
              desktop={(users) => (
                <Table headers={[t("common.name"), t("common.role"), t("common.status"), t("common.phone"), t("users.joined"), ""]}>
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-hover/70">
                      <Td>
                        <span className="font-medium text-fg-base">{user.full_name || user.username}</span>
                        <span className="block text-xs text-fg-subtle">@{user.username}</span>
                      </Td>
                      <Td><RoleBadge role={user.role} /></Td>
                      <Td><UserAccountStatusBadge status={user.status} isBlocked={user.is_blocked} /></Td>
                      <Td>{user.phone || "—"}</Td>
                      <Td><span className="text-xs text-fg-muted">{fmt.date(user.date_joined)}</span></Td>
                      <Td className="text-right"><UserRowActions userId={user.id} role={user.role} /></Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(user) => (
                <article
                  data-testid="mobile-user-card"
                  className="rounded-2xl border border-border-base bg-surface-card p-4 shadow-[var(--dashboard-shadow-panel)]"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-heading text-sm font-bold text-fg-base">
                        {user.full_name || user.username}
                      </h2>
                      <p className="truncate text-xs text-fg-subtle">@{user.username}</p>
                    </div>
                    <UserAccountStatusBadge status={user.status} isBlocked={user.is_blocked} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-fg-subtle">{t("common.role")}</p>
                      <div className="mt-1"><RoleBadge role={user.role} /></div>
                    </div>
                    <div>
                      <p className="text-fg-subtle">{t("common.phone")}</p>
                      <p className="mt-1 break-words font-medium text-fg-base">{user.phone || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-fg-subtle">{t("users.joined")}</p>
                      <p className="mt-1 font-medium text-fg-base">{fmt.date(user.date_joined)}</p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-border-base pt-2">
                    <UserRowActions userId={user.id} role={user.role} />
                  </div>
                </article>
              )}
            />
          )}
        </div>

        {totalPages > 1 ? (
          <nav
            className="flex items-center justify-center gap-1.5 px-4 py-4"
            aria-label={locale === "bn" ? "পেজিনেশন" : "Pagination"}
          >
            {pageNumbers.map((p, i) => (
              <span key={p} className="flex items-center gap-1.5">
                {i > 0 && pageNumbers[i - 1] !== p - 1 ? <span className="text-fg-subtle">…</span> : null}
                <button
                  type="button"
                  onClick={() => applyUrl({ page: p }, "push")}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    "flex size-10 cursor-pointer items-center justify-center rounded-xl text-sm font-medium",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                    p === page ? "bg-brand-500 text-white" : "text-fg-muted hover:bg-surface-hover",
                  )}
                >
                  {fmt.num(p)}
                </button>
              </span>
            ))}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
