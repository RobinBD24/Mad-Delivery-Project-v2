"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { DeliveryAreaListSkeleton } from "@/components/delivery/delivery-area-list-skeleton";
import { Icon } from "@/components/layout/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Table, Td } from "@/components/ui/table";
import type { ActionState } from "@/lib/api/action-state";
import {
  DELIVERY_AREA_PAGE_SIZE,
  deliveryAreaQueryParams,
  parseDeliveryAreaQuery,
  type DeliveryAreaListQuery,
  type DeliveryAreaListResult,
  type DeliveryAreaRow,
} from "@/lib/delivery-areas/query";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

interface DeliveryAreaApiResponse {
  count: number;
  page: number;
  page_size: number;
  results: DeliveryAreaRow[];
  summary: DeliveryAreaListResult["summary"];
}

function fromApi(response: DeliveryAreaApiResponse): DeliveryAreaListResult {
  return {
    count: response.count,
    page: response.page,
    pageSize: response.page_size,
    results: response.results,
    summary: response.summary,
  };
}

function currentListHref(pathname: string, raw: string): string {
  return raw ? `${pathname}?${raw}` : pathname;
}

export function DeliveryAreaExplorer({
  initial,
  initialQuery,
  isSuperAdmin,
  branches = [],
  assignedBranchName,
  listPath,
}: {
  initial: DeliveryAreaListResult;
  initialQuery: string;
  isSuperAdmin: boolean;
  branches?: { id: number; name: string }[];
  assignedBranchName?: string | null;
  listPath: string;
}) {
  const { t, fmt } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawSearchParams = searchParams.toString();
  const query = useMemo(
    () => parseDeliveryAreaQuery(new URLSearchParams(rawSearchParams)),
    [rawSearchParams],
  );
  const [searchInput, setSearchInput] = useState(query.search);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    searchParams.get("result") === "created"
      ? t("deliveryArea.created")
      : searchParams.get("result") === "updated"
        ? t("deliveryArea.updated")
        : null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const sequence = useRef(0);
  const dataQuery = useRef(initialQuery);
  const committedSearch = useRef<string | null>(null);
  const requestedQuery = deliveryAreaQueryParams(query).toString();
  const loadErrorMessage = t("deliveryArea.loadError");
  const hasFilters = Boolean(
    query.search ||
      query.branchId ||
      query.activeStatus ||
      query.deliveryState ||
      query.sort !== "name" ||
      query.direction !== "asc" ||
      query.pageSize !== DELIVERY_AREA_PAGE_SIZE,
  );

  const navigate = useCallback(
    (
      patch: Partial<DeliveryAreaListQuery>,
      mode: "push" | "replace" = "push",
    ) => {
      const next = { ...query, ...patch };
      const params = deliveryAreaQueryParams(next);
      const url = params.size ? `${pathname}?${params}` : pathname;
      window.history[mode === "push" ? "pushState" : "replaceState"](
        null,
        "",
        url,
      );
    },
    [pathname, query],
  );

  useEffect(() => {
    if (searchInput === query.search) return;
    const timer = window.setTimeout(() => {
      committedSearch.current = searchInput.trim();
      navigate({ search: searchInput.trim(), page: 1 }, "replace");
    }, searchInput ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [navigate, query.search, searchInput]);

  useEffect(() => {
    if (committedSearch.current === query.search) {
      committedSearch.current = null;
      return;
    }
    setSearchInput(query.search);
  }, [query.search]);

  useEffect(() => {
    if (requestedQuery === dataQuery.current && refreshKey === 0) return;
    const controller = new AbortController();
    const requestNumber = ++sequence.current;
    setLoading(true);
    setError(null);

    fetch(
      `/api/delivery-areas${requestedQuery ? `?${requestedQuery}` : ""}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DeliveryAreaApiResponse>;
      })
      .then((response) => {
        if (sequence.current !== requestNumber) return;
        const next = fromApi(response);
        const normalized = deliveryAreaQueryParams({
          ...parseDeliveryAreaQuery(new URLSearchParams(requestedQuery)),
          page: next.page,
          pageSize: next.pageSize,
        }).toString();
        dataQuery.current = normalized;
        setData(next);
        setLoading(false);
        setRefreshKey(0);
        if (normalized !== requestedQuery) {
          const url = normalized ? `${pathname}?${normalized}` : pathname;
          window.history.replaceState(null, "", url);
        }
      })
      .catch((caught: unknown) => {
        if ((caught as Error)?.name === "AbortError") return;
        if (sequence.current !== requestNumber) return;
        setLoading(false);
        setRefreshKey(0);
        setError(loadErrorMessage);
      });
    return () => controller.abort();
  }, [loadErrorMessage, pathname, refreshKey, requestedQuery]);

  function clearFilters() {
    committedSearch.current = "";
    setSearchInput("");
    window.history.pushState(null, "", listPath);
  }

  function retry() {
    dataQuery.current = "";
    setRefreshKey((value) => value + 1);
  }

  async function changeHold(
    area: DeliveryAreaRow,
    reason: string,
  ): Promise<ActionState> {
    const response = await fetch(
      `/api/delivery-areas/${area.id}/${area.is_held ? "resume" : "hold"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: area.is_held ? undefined : JSON.stringify({ reason }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsed = parseFieldErrors(body, t("common.error"));
      return {
        error:
          parsed.formError ??
          parsed.fieldErrors.reason ??
          t("common.error"),
        fieldErrors: parsed.fieldErrors,
      };
    }
    setSuccess(
      area.is_held ? t("deliveryArea.resumed") : t("deliveryArea.held"),
    );
    dataQuery.current = "";
    setRefreshKey((value) => value + 1);
    return { error: null };
  }

  const totalPages = Math.max(1, Math.ceil(data.count / data.pageSize));
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) =>
      page === 1 || page === totalPages || Math.abs(page - data.page) <= 1,
  );
  const start = data.count === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.count);
  const currentHref = currentListHref(pathname, rawSearchParams);

  function editHref(area: DeliveryAreaRow) {
    const params = new URLSearchParams({ returnTo: currentHref });
    return `${listPath}/${area.id}/edit?${params}`;
  }

  function areaActions(area: DeliveryAreaRow, mobile = false) {
    const holding = !area.is_held;
    return (
      <div className={cn("flex gap-2", mobile ? "w-full" : "justify-end")}>
        <ButtonLink
          href={editHref(area)}
          variant="outline"
          size="sm"
          className={mobile ? "flex-1" : undefined}
        >
          <Icon name="edit" className="size-4" />
          {t("common.edit")}
        </ButtonLink>
        <ConfirmModal
          trigger={
            <Button
              type="button"
              size="sm"
              variant={area.is_held ? "success" : "outline"}
              className={mobile ? "flex-1" : undefined}
            >
              {area.is_held
                ? t("deliveryArea.resumeDelivery")
                : t("deliveryArea.holdDelivery")}
            </Button>
          }
          title={
            holding
              ? t("deliveryArea.confirmHoldTitle", { name: area.name })
              : t("deliveryArea.confirmResumeTitle", { name: area.name })
          }
          description={
            holding
              ? t("deliveryArea.confirmHoldDescription")
              : t("deliveryArea.confirmResumeDescription")
          }
          confirmLabel={
            holding
              ? t("deliveryArea.holdDelivery")
              : t("deliveryArea.resumeDelivery")
          }
          withReason={holding}
          reasonPlaceholder={t("deliveryArea.holdReasonPlaceholder")}
          action={(reason) => changeHold(area, reason)}
        />
      </div>
    );
  }

  function statusBadges(area: DeliveryAreaRow) {
    return (
      <>
        <Badge dot tone={area.is_held ? "red" : "green"}>
          {area.is_held
            ? t("deliveryArea.onHold")
            : t("deliveryArea.available")}
        </Badge>
        <Badge dot tone={area.is_active ? "blue" : "slate"}>
          {area.is_active ? t("common.active") : t("common.inactive")}
        </Badge>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="success" message={success} />

      <section
        aria-label={t("deliveryArea.summary")}
        className={cn(
          "grid gap-3",
          isSuperAdmin
            ? "grid-cols-2 lg:grid-cols-5"
            : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        {[
          [t("deliveryArea.totalAreas"), data.summary.total, "list"],
          [t("deliveryArea.activeAreas"), data.summary.active, "check"],
          [t("deliveryArea.onHold"), data.summary.held, "clock"],
          [t("deliveryArea.inactiveAreas"), data.summary.inactive, "x"],
          ...(isSuperAdmin
            ? [
                [
                  t("deliveryArea.branchesCovered"),
                  data.summary.branches,
                  "building",
                ],
              ]
            : []),
        ].map(([label, value, icon]) => (
          <Card key={String(label)} className="p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-brand-500">
                <Icon name={String(icon)} className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-fg-muted">{label}</p>
                <p className="mt-0.5 font-heading text-xl font-bold tabular-nums text-fg-base">
                  {fmt.num(Number(value))}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_160px_180px_220px_auto]">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("deliveryArea.searchPlaceholder")}
                aria-label={t("deliveryArea.searchPlaceholder")}
                className="pl-9 pr-10"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label={t("deliveryArea.clearSearch")}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg-base"
                >
                  <Icon name="x" className="size-4" />
                </button>
              ) : null}
            </div>

            {isSuperAdmin ? (
              <Select
                value={query.branchId ? String(query.branchId) : ""}
                onChange={(event) =>
                  navigate({
                    branchId: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                    page: 1,
                  })
                }
                aria-label={t("deliveryArea.filterBranch")}
              >
                <option value="">{t("deliveryArea.allBranches")}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex h-10 items-center rounded-xl border border-border-base bg-surface-muted px-3 text-sm text-fg-muted">
                <span className="truncate">
                  {t("deliveryArea.branchContext", {
                    name: assignedBranchName ?? t("common.notAssigned"),
                  })}
                </span>
              </div>
            )}

            <Select
              value={query.activeStatus ?? ""}
              onChange={(event) =>
                navigate({
                  activeStatus:
                    event.target.value === "active" ||
                    event.target.value === "inactive"
                      ? event.target.value
                      : undefined,
                  page: 1,
                })
              }
              aria-label={t("deliveryArea.filterStatus")}
            >
              <option value="">{t("deliveryArea.allStatuses")}</option>
              <option value="active">{t("common.active")}</option>
              <option value="inactive">{t("common.inactive")}</option>
            </Select>

            <Select
              value={query.deliveryState ?? ""}
              onChange={(event) =>
                navigate({
                  deliveryState:
                    event.target.value === "available" ||
                    event.target.value === "held"
                      ? event.target.value
                      : undefined,
                  page: 1,
                })
              }
              aria-label={t("deliveryArea.filterDeliveryState")}
            >
              <option value="">{t("deliveryArea.allDeliveryStates")}</option>
              <option value="available">{t("deliveryArea.available")}</option>
              <option value="held">{t("deliveryArea.onHold")}</option>
            </Select>

            <Select
              value={`${query.sort}:${query.direction}`}
              onChange={(event) => {
                const [sort, direction] = event.target.value.split(":");
                navigate({
                  sort: sort as DeliveryAreaListQuery["sort"],
                  direction: direction as DeliveryAreaListQuery["direction"],
                  page: 1,
                });
              }}
              aria-label={t("deliveryArea.sortBy")}
            >
              <option value="name:asc">{t("deliveryArea.sortNameAsc")}</option>
              <option value="name:desc">{t("deliveryArea.sortNameDesc")}</option>
              {isSuperAdmin ? (
                <>
                  <option value="branch:asc">{t("deliveryArea.sortBranchAsc")}</option>
                  <option value="branch:desc">{t("deliveryArea.sortBranchDesc")}</option>
                </>
              ) : null}
              <option value="minutes:asc">{t("deliveryArea.sortTimeAsc")}</option>
              <option value="minutes:desc">{t("deliveryArea.sortTimeDesc")}</option>
              <option value="charge:asc">{t("deliveryArea.sortChargeAsc")}</option>
              <option value="charge:desc">{t("deliveryArea.sortChargeDesc")}</option>
              <option value="updated:desc">{t("deliveryArea.sortNewest")}</option>
              <option value="updated:asc">{t("deliveryArea.sortOldest")}</option>
            </Select>

            <Button
              type="button"
              variant="ghost"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="w-full"
            >
              {t("deliveryArea.clearFilters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div aria-busy={loading}>
        <Card>
        {error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button type="button" variant="outline" onClick={retry}>
              {t("common.retry")}
            </Button>
          </div>
        ) : loading ? (
          <DeliveryAreaListSkeleton />
        ) : data.results.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title={t("deliveryArea.noMatches")}
              description={t("deliveryArea.noMatchesDesc")}
              action={
                <Button type="button" variant="outline" onClick={clearFilters}>
                  {t("deliveryArea.clearFilters")}
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={t("deliveryArea.empty")}
              description={t("deliveryArea.emptyDesc")}
              action={
                <ButtonLink href={`${listPath}/new`}>
                  <Icon name="plus" className="size-4" />
                  {t("deliveryArea.addDeliveryArea")}
                </ButtonLink>
              }
            />
          )
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                headers={[
                  t("deliveryArea.name"),
                  ...(isSuperAdmin ? [t("deliveryArea.branch")] : []),
                  t("deliveryArea.minutesShort"),
                  t("deliveryArea.charge"),
                  t("deliveryArea.deliveryState"),
                  t("deliveryArea.activeStatus"),
                  t("deliveryArea.updatedAt"),
                  t("common.actions"),
                ]}
              >
                {data.results.map((area) => (
                  <tr key={area.id} className="hover:bg-surface-hover/60">
                    <Td>
                      <span className="font-semibold text-fg-base">
                        {area.name}
                      </span>
                    </Td>
                    {isSuperAdmin ? (
                      <Td>
                        <span className="block font-medium">
                          {area.branch_name}
                        </span>
                        {area.branch_address ? (
                          <span className="mt-0.5 block max-w-48 truncate text-xs text-fg-subtle">
                            {area.branch_address}
                          </span>
                        ) : null}
                      </Td>
                    ) : null}
                    <Td mono>
                      {fmt.num(area.estimated_delivery_minutes)}{" "}
                      {t("deliveryArea.min")}
                    </Td>
                    <Td mono>
                      {Number(area.delivery_charge) === 0
                        ? t("deliveryArea.free")
                        : fmt.money(area.delivery_charge)}
                    </Td>
                    <Td>
                      <Badge dot tone={area.is_held ? "red" : "green"}>
                        {area.is_held
                          ? t("deliveryArea.onHold")
                          : t("deliveryArea.available")}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge dot tone={area.is_active ? "blue" : "slate"}>
                        {area.is_active
                          ? t("common.active")
                          : t("common.inactive")}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {fmt.date(area.updated_at)}
                    </Td>
                    <Td>{areaActions(area)}</Td>
                  </tr>
                ))}
              </Table>
            </div>

            <div
              className="grid gap-3 p-3 md:hidden"
              data-testid="delivery-area-mobile-list"
            >
              {data.results.map((area) => (
                <article
                  key={area.id}
                  className="min-w-0 rounded-xl border border-border-base p-4"
                >
                  <div className="min-w-0">
                    <h3 className="break-words font-heading text-base font-bold text-fg-base">
                      {area.name}
                    </h3>
                    {isSuperAdmin ? (
                      <p className="mt-1 break-words text-sm text-fg-muted">
                        {area.branch_name}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {statusBadges(area)}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-fg-subtle">
                        {t("deliveryArea.minutesShort")}
                      </dt>
                      <dd className="mt-0.5 font-medium text-fg-base">
                        {fmt.num(area.estimated_delivery_minutes)}{" "}
                        {t("deliveryArea.min")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">
                        {t("deliveryArea.charge")}
                      </dt>
                      <dd className="mt-0.5 font-medium text-fg-base">
                        {Number(area.delivery_charge) === 0
                          ? t("deliveryArea.free")
                          : fmt.money(area.delivery_charge)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-fg-subtle">
                        {t("deliveryArea.updatedAt")}
                      </dt>
                      <dd className="mt-0.5 text-fg-muted">
                        {fmt.date(area.updated_at)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4">{areaActions(area, true)}</div>
                </article>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-border-base px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-sm text-fg-muted sm:text-left">
                {t("deliveryArea.showingResults", {
                  start: fmt.num(start),
                  end: fmt.num(end),
                  total: fmt.num(data.count),
                })}
              </p>
              <nav
                aria-label={t("deliveryArea.pagination")}
                className="flex flex-wrap items-center justify-center gap-1.5"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={data.page <= 1}
                  onClick={() => navigate({ page: data.page - 1 })}
                >
                  {t("deliveryArea.previous")}
                </Button>
                {pages.map((page, index) => (
                  <span key={page} className="flex items-center gap-1.5">
                    {index > 0 && pages[index - 1] !== page - 1 ? (
                      <span className="text-fg-subtle">…</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => navigate({ page })}
                      aria-current={page === data.page ? "page" : undefined}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg text-sm font-medium",
                        page === data.page
                          ? "bg-brand-500 text-white"
                          : "text-fg-muted hover:bg-surface-hover",
                      )}
                    >
                      {fmt.num(page)}
                    </button>
                  </span>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={data.page >= totalPages}
                  onClick={() => navigate({ page: data.page + 1 })}
                >
                  {t("deliveryArea.next")}
                </Button>
              </nav>
            </div>
          </>
        )}
        </Card>
      </div>
    </div>
  );
}
