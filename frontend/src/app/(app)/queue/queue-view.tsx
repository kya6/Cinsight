"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardTitle, FieldLabel } from "@/components/card";
import { DataTable, SelectRowButton, Truncate, type Column } from "@/components/data-table";
import { ComboboxField, controlClass, Field, SelectField } from "@/components/form-fields";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Bone, EmptyState, ErrorState, Loading } from "@/components/states";
import { ScoreBar, TIERS, TierChip } from "@/components/tier";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiLink, queries, type ComplaintFilters, type ScoredComplaint, type Tier } from "@/lib/api";
import { formatCount, formatDate, formatDay, formatFactor, formatMonth, formatScore } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const ALL = "all";

/** Filters come from the URL so a filtered queue can be shared or linked to (?tier=High&q=17687593). */
function useQueueFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tierParam = params.get("tier");
  const tier = tierParam === ALL ? undefined : (TIERS.find((t) => t === tierParam) ?? "High");
  const filters: ComplaintFilters = {
    tier,
    q: params.get("q") || undefined,
    product: params.get("product") || undefined,
    company: params.get("company") || undefined,
    date_from: params.get("from") || undefined,
    date_to: params.get("to") || undefined,
    page: Math.max(1, Number(params.get("page")) || 1),
    page_size: PAGE_SIZE,
  };

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in patch)) next.delete("page"); // any filter change goes back to page 1
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return { filters, update };
}

export function QueueView() {
  const { filters, update } = useQueueFilters();
  const page = useQuery({ ...queries.complaints(filters), placeholderData: keepPreviousData });
  const kpis = useQuery(queries.dashboard("kpis"));
  const options = useQuery(queries.options());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(() => page.data?.items ?? [], [page.data]);
  const selected = rows.find((r) => String(r["Complaint ID"]) === selectedId) ?? rows[0] ?? null;

  const month = kpis.data?.test_month;
  const monthName = month ? `${formatMonth(month, true)} ${month.slice(0, 4)}` : "Test-month";
  const exportFilters = { ...filters, page: undefined, page_size: undefined };

  const failed = page.isError ? page : kpis.isError ? kpis : options.isError ? options : null;

  return (
    <>
      <PageHeader
        title="High-risk queue"
        description={`${monthName} complaints ranked by score. Review the top of the list first.`}
        action={
          <Button asChild variant="outline" className="px-4.75">
            <a href={apiLink("/api/complaints/export", exportFilters)} download>
              <Icon name="download" />
              Export CSV
            </a>
          </Button>
        }
      />

      <TierTabs
        active={filters.tier ?? undefined}
        counts={page.data?.tier_counts}
        onChange={(tier) => update({ tier: tier ?? ALL })}
      />

      <Filters
        filters={filters}
        update={update}
        products={options.data ? Object.keys(options.data.hierarchy) : []}
        companies={options.data?.companies.map((c) => c.name) ?? []}
        month={month}
      />

      {failed ? (
        <ErrorState error={failed.error} onRetry={() => failed.refetch()} />
      ) : (
        <div className="grid items-start gap-3.5 md:gap-4 xl:grid-cols-[minmax(0,724fr)_minmax(0,380fr)]">
          <QueueTable
            rows={rows}
            total={page.data?.total}
            loading={page.isPending}
            filters={filters}
            selectedId={selected ? String(selected["Complaint ID"]) : null}
            onSelect={setSelectedId}
            onPage={(n) => update({ page: String(n) })}
            onClear={() => update({ q: undefined, product: undefined, company: undefined, from: undefined, to: undefined })}
          />
          <DetailPanel complaint={selected} loading={page.isPending} />
        </div>
      )}
    </>
  );
}

// ---- Tier tabs

const ACTIVE_TAB: Record<Tier | "all", string> = {
  all: "border-ink-3 bg-chip text-ink",
  High: "border-high-line-2 bg-high-bg text-high",
  Medium: "border-medium-bg bg-medium-bg text-medium",
  Low: "border-ghost bg-low-bg text-low",
};

function TierTabs({ active, counts, onChange }: {
  active?: Tier;
  counts?: { High: number; Medium: number; Low: number };
  onChange: (tier?: Tier) => void;
}) {
  const tabs: { tier?: Tier; label: string; count?: number }[] = [
    { label: "All", count: counts && counts.High + counts.Medium + counts.Low },
    ...TIERS.map((tier) => ({ tier, label: tier, count: counts?.[tier] })),
  ];
  return (
    <div role="group" aria-label="Filter by tier" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:gap-4 md:px-0 xl:gap-2">
      {tabs.map(({ tier, label, count }) => {
        const isActive = active === tier;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(tier)}
            className={cn(
              "flex h-10.5 shrink-0 items-center gap-2 rounded-lg border px-3.75 text-13 leading-17 font-medium transition-colors",
              isActive ? ACTIVE_TAB[tier ?? "all"] : "border-ghost text-ink-button hover:bg-surface",
            )}
          >
            {label}
            <span className={cn("tabular-nums", !isActive && "text-ink-4")}>
              {count === undefined ? "…" : formatCount(count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Filters

function Filters({ filters, update, products, companies, month }: {
  filters: ComplaintFilters;
  update: (patch: Record<string, string | undefined>) => void;
  products: string[];
  companies: string[];
  month?: string;
}) {
  const [search, setSearch] = useState(filters.q ?? "");
  useEffect(() => {
    if ((filters.q ?? "") === search.trim()) return;
    const timer = setTimeout(() => update({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid items-end gap-3.5 md:grid-cols-2 md:gap-4 xl:grid-cols-[minmax(0,514fr)_200px_200px_170px] xl:gap-3">
      <div className="relative">
        <label htmlFor="queue-search" className="sr-only">
          Search complaint ID, company or words in the narrative
        </label>
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-3" />
        <input
          id="queue-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search complaint ID, company or words in the narrative"
          className={cn(controlClass, "h-11 pl-11 font-medium")}
        />
      </div>
      <Field id="queue-product" label="Product">
        <SelectField
          id="queue-product"
          value={filters.product ?? ALL}
          onChange={(v) => update({ product: v === ALL ? undefined : v })}
          options={[{ value: ALL, label: "All products" }, ...products.map((value) => ({ value }))]}
          placeholder="All products"
          className="h-11 data-[size=default]:h-11"
        />
      </Field>
      <Field id="queue-company" label="Company">
        <ComboboxField
          id="queue-company"
          value={filters.company ?? ""}
          onChange={(v) => update({ company: v || undefined })}
          options={companies}
          allLabel="All companies"
          placeholder="All companies"
          searchPlaceholder="Search companies…"
        />
      </Field>
      <Field id="queue-received" label="Received">
        <DateRange filters={filters} update={update} month={month} />
      </Field>
    </div>
  );
}

function monthBounds(month?: string) {
  if (!month) return { min: undefined, max: undefined };
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { min: `${month}-01`, max: `${month}-${String(last).padStart(2, "0")}` };
}

function DateRange({ filters, update, month }: {
  filters: ComplaintFilters;
  update: (patch: Record<string, string | undefined>) => void;
  month?: string;
}) {
  const { min, max } = monthBounds(month);
  const from = filters.date_from ?? min;
  const to = filters.date_to ?? max;
  const label = from && to ? `${formatDay(from)} – ${formatDay(to)}` : "Any date";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button id="queue-received" type="button" className={cn(controlClass, "flex h-11 items-center justify-between gap-2 text-left")}>
          <span className="truncate">{label}</span>
          <Icon name="chevron-down" className="h-1.5 w-2.5 text-ink" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3 border border-line bg-surface p-4">
        {(["from", "to"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1.5 text-13 leading-17 font-medium text-ink-2">
            {key === "from" ? "From" : "To"}
            <input
              type="date"
              min={min}
              max={max}
              value={(key === "from" ? filters.date_from : filters.date_to) ?? (key === "from" ? min : max) ?? ""}
              onChange={(e) => update({ [key]: e.target.value || undefined })}
              className={cn(controlClass, "h-10 [color-scheme:dark]")}
            />
          </label>
        ))}
        <Button variant="outline" size="md" onClick={() => update({ from: undefined, to: undefined })}>
          Whole month
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ---- Table

function QueueTable({ rows, total, loading, filters, selectedId, onSelect, onPage, onClear }: {
  rows: ScoredComplaint[];
  total?: number;
  loading: boolean;
  filters: ComplaintFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onClear: () => void;
}) {
  const pageNumber = filters.page ?? 1;
  const first = total ? (pageNumber - 1) * PAGE_SIZE + 1 : 0;
  const last = total ? Math.min(pageNumber * PAGE_SIZE, total) : 0;
  const pages = total ? Math.ceil(total / PAGE_SIZE) : 1;

  const columns = useMemo<Column<ScoredComplaint>[]>(
    () => [
      {
        id: "id",
        header: "Complaint",
        meta: { className: "w-22.5", skeleton: "w-16" },
        cell: ({ row }) => {
          const id = String(row.original["Complaint ID"]);
          return (
            <SelectRowButton label={`Show complaint ${id}`} selected={id === selectedId} onSelect={() => onSelect(id)}>
              <span className="tabular-nums">{id}</span>
            </SelectRowButton>
          );
        },
      },
      {
        id: "received",
        header: "Received",
        meta: { className: "w-20", skeleton: "w-15" },
        cell: ({ row }) => formatDay(row.original["Date received"]),
      },
      {
        id: "product",
        header: "Product",
        meta: { className: "w-27.5", skeleton: "w-20" },
        cell: ({ row }) => <Truncate>{row.original.Product}</Truncate>,
      },
      {
        id: "company",
        header: "Company",
        meta: { className: "w-31.5", skeleton: "w-18" },
        cell: ({ row }) => <Truncate>{row.original.Company}</Truncate>,
      },
      {
        id: "score",
        header: "Score",
        meta: { className: "w-24", skeleton: "w-18" },
        cell: ({ row }) => <ScoreBar score={row.original.score} tier={row.original.tier} />,
      },
      {
        id: "tier",
        header: "Tier",
        meta: { className: "w-17.5", skeleton: "h-6 w-11 rounded-full" },
        cell: ({ row }) => (
          <TierChip
            tier={row.original.tier}
            tone={String(row.original["Complaint ID"]) === selectedId ? "tinted" : "neutral"}
          />
        ),
      },
      {
        id: "reason",
        header: "Top reason",
        meta: { skeleton: "w-20" },
        cell: ({ row }) => <Truncate>{formatFactor(row.original.top_reason ?? "—")}</Truncate>,
      },
    ],
    [selectedId, onSelect],
  );

  return (
    <Card aria-labelledby="queue-title">
      <CardTitle id="queue-title">
        {total === undefined ? "Loading complaints…" : `${formatCount(total)} complaints · sorted by score`}
      </CardTitle>
      <DataTable
        label="Complaints in the queue"
        columns={columns}
        data={rows}
        getRowId={(r) => String(r["Complaint ID"])}
        selectedId={selectedId}
        minWidth={680}
        loading={loading}
        skeletonRows={PAGE_SIZE}
        empty={
          <EmptyState
            title="No complaints match these filters"
            action={
              <Button variant="outline" size="md" onClick={onClear}>
                Clear filters
              </Button>
            }
          >
            Try another tier, a wider date range or a different search.
          </EmptyState>
        }
      />
      <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-14 font-semibold text-ink-3" aria-live="polite">
          {total ? `Showing ${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}` : " "}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="md" disabled={pageNumber <= 1 || loading} onClick={() => onPage(pageNumber - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="md" disabled={pageNumber >= pages || loading} onClick={() => onPage(pageNumber + 1)}>
            Next
          </Button>
        </div>
      </nav>
    </Card>
  );
}

// ---- Selected complaint

function DetailPanel({ complaint, loading }: { complaint: ScoredComplaint | null; loading: boolean }) {
  const [copied, setCopied] = useState(false);
  const id = complaint ? String(complaint["Complaint ID"]) : "";
  const copy = async () => {
    await navigator.clipboard?.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside
      aria-labelledby="detail-title"
      className="flex flex-col gap-4.5 rounded-card border border-brand-line bg-surface p-5.25"
    >
      <div className="flex h-9 items-center justify-between">
        <FieldLabel id="detail-title">Selected complaint</FieldLabel>
        {complaint && (
          <Button variant="outline" size="icon" aria-label={copied ? "Complaint ID copied" : `Copy complaint ID ${id}`} onClick={copy}>
            <Icon name="copy" className="size-3.25" />
          </Button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Complaint ID copied" : ""}
      </span>

      {loading ? (
        <Loading label="Loading the selected complaint" className="flex flex-col gap-4.5">
          <Bone className="h-7 w-40" />
          <div className="grid grid-cols-2 gap-3.5">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="flex flex-col gap-1.5">
                <Bone className="w-16" />
                <Bone />
              </span>
            ))}
          </div>
          <Bone className="h-23 rounded-lg" />
        </Loading>
      ) : !complaint ? (
        <EmptyState title="Nothing selected" className="bg-transparent px-0">
          Select a complaint in the table to see its narrative and reasons.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3.25">
            <p className="text-26 font-semibold text-ink tabular-nums">{id}</p>
            <TierChip tier={complaint.tier} className="gap-1.5 bg-chip pr-2.25 pl-2.5">
              {complaint.tier} ·<span className="text-ink-4 tabular-nums">{formatScore(complaint.score)}</span>
            </TierChip>
          </div>

          <dl className="grid grid-cols-2 gap-3.5">
            {(
              [
                ["Received", formatDate(complaint["Date received"])],
                ["State", complaint.State],
                ["Product", complaint.Product],
                ["Sub-product", complaint["Sub-product"]],
                ["Issue", complaint.Issue],
                ["Company", complaint.Company],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col gap-1.5">
                <dt className="text-10 leading-13 font-semibold tracking-[0.8px] text-ink-3">{label}</dt>
                <dd className="text-13 leading-17 break-words text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="narrative-title" className="flex flex-col gap-2">
            <FieldLabel id="narrative-title">Narrative (first 280 characters)</FieldLabel>
            <p className="rounded-lg bg-inset p-3.5 text-13 leading-19 break-words whitespace-pre-line text-ink-2">
              {complaint.narrative_preview || "No narrative was submitted."}
            </p>
          </section>

          <section aria-labelledby="reasons-title" className="flex flex-col gap-2.5">
            <FieldLabel id="reasons-title">Top reasons</FieldLabel>
            <ul className="flex flex-col gap-2.5">
              {complaint.reasons.map((r) => {
                const [group, ...rest] = formatFactor(r.factor).split(": ");
                const toward = r.direction === "toward relief";
                return (
                  <li key={r.factor} className="flex items-start justify-between gap-3 text-13 leading-17">
                    <span className="min-w-0 break-words">
                      {rest.length ? (
                        <>
                          <span className="text-legend-strong">{group}: </span>
                          <span className="text-rule-value">{rest.join(": ")}</span>
                        </>
                      ) : (
                        <span className="text-ink">{group}</span>
                      )}
                    </span>
                    <span className={cn("shrink-0", toward ? "text-brand" : "text-high")}>
                      {toward ? "raises" : "lowers"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {complaint.top_words.length > 0 && (
              <p className="text-13 leading-17">
                <span className="text-legend">Top words: </span>
                <span className="text-rule-value">{complaint.top_words.join(" · ")}</span>
              </p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
