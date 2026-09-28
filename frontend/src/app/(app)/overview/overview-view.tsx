"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/card";
import { ChartTooltip } from "@/components/chart-tooltip";
import { CountUp } from "@/components/count-up";
import { DataTable, Truncate, type Column } from "@/components/data-table";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Bone, EmptyState, ErrorState, Loading } from "@/components/states";
import { ScoreBar, TIERS, TierChip } from "@/components/tier";
import { Button } from "@/components/ui/button";
import { queries, type Dashboard, type ModelMeta, type ScoredComplaint, type Tier } from "@/lib/api";
import { formatCount, formatDay, formatMonth, formatMonthRange, formatPercent, formatScore } from "@/lib/format";

export function OverviewView() {
  const kpis = useQuery(queries.dashboard("kpis"));
  const outcomes = useQuery(queries.dashboard("outcomes"));
  const monthly = useQuery(queries.dashboard("monthly"));
  const testMetrics = useQuery(queries.dashboard("test_metrics"));
  const comparison = useQuery(queries.dashboard("model_comparison"));
  const top = useQuery(queries.dashboard("high_risk_top", 5));
  const meta = useQuery(queries.meta());

  const all = [kpis, outcomes, monthly, testMetrics, comparison, top, meta];
  const failed = all.find((q) => q.isError);

  const period = kpis.data ? formatMonthRange(kpis.data.date_from, kpis.data.date_to) : "the data period";
  const testMonth = kpis.data ? formatMonth(kpis.data.test_month, true) : "the test month";

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Complaints received ${period} and how the ${testMonth} month was prioritized.`}
        action={
          <Button asChild>
            <Link href="/score">
              <Icon name="plus-square" />
              Score a complaint
            </Link>
          </Button>
        }
      />

      {failed ? (
        <ErrorState error={failed.error} onRetry={() => all.forEach((q) => q.refetch())} />
      ) : (
        <>
          <KpiCards kpis={kpis.data} testMetrics={testMetrics.data} comparison={comparison.data} />

          <div className="grid gap-3.5 md:grid-cols-2 md:gap-4 xl:grid-cols-[328px_minmax(0,1fr)_328px]">
            <OutcomeCard kpis={kpis.data} outcomes={outcomes.data} />
            <MonthlyCard monthly={monthly.data} meta={meta.data} />
            <PriorityCard
              kpis={kpis.data}
              testMetrics={testMetrics.data}
              meta={meta.data}
              className="md:col-span-2 xl:col-span-1"
            />
          </div>

          <div className="grid gap-3.5 md:gap-4 xl:grid-cols-[minmax(0,1fr)_328px]">
            <TopScoresCard rows={top.data} loading={top.isPending} testMonth={testMonth} />
            <TierRulesCard meta={meta.data} />
          </div>
        </>
      )}
    </>
  );
}

// ---- KPI cards

const KPI_LABELS = ["Complaints", "Relief rate", "Flagged for early review", "PR-AUC (validation)"];

function KpiCards({ kpis, testMetrics, comparison }: {
  kpis?: Dashboard["kpis"];
  testMetrics?: Dashboard["test_metrics"];
  comparison?: Dashboard["model_comparison"];
}) {
  const cards =
    kpis && testMetrics && comparison
      ? [
          {
            value: kpis.total_complaints,
            format: formatCount,
            caption: `${formatMonthRange(kpis.date_from, kpis.date_to)}, excluding complaints still in progress`,
          },
          {
            value: kpis.relief_rate,
            format: (n: number) => formatPercent(n),
            valueClass: "text-brand",
            caption: `${formatCount(kpis.relief_count)} of ${formatCount(kpis.labeled_complaints)} labeled complaints ended in relief`,
          },
          {
            value: kpis.test_tier_counts.High,
            format: formatCount,
            valueClass: "text-high",
            caption: `${formatPercent(kpis.test_tier_shares.High)} of ${formatCount(kpis.test_complaints)} ${formatMonth(kpis.test_month, true)} complaints`,
          },
          {
            value: testMetrics.validation.pr_auc,
            format: (n: number) => n.toFixed(3),
            caption: `vs ${comparison.positive_rate.toFixed(3)} for a no-skill baseline`,
          },
        ]
      : null;

  return (
    <div className="grid gap-3.5 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
      {KPI_LABELS.map((label, i) => {
        const card = cards?.[i];
        return (
          <Card key={label} className="gap-1.5">
            <h2 className="text-13 text-ink-3">{label}</h2>
            {card ? (
              <>
                <p className={`text-34 font-semibold tabular-nums ${card.valueClass ?? "text-ink"}`}>
                  <CountUp value={card.value} format={card.format} />
                </p>
                <p className="text-13 text-ink-3">{card.caption}</p>
              </>
            ) : (
              <Loading label={`Loading ${label}`} className="flex flex-col gap-3 py-1.5">
                <Bone className="h-8 w-28" />
                <Bone className="w-4/5" />
              </Loading>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---- Outcome donut

function OutcomeCard({ kpis, outcomes }: { kpis?: Dashboard["kpis"]; outcomes?: Dashboard["outcomes"] }) {
  const slices =
    kpis && outcomes
      ? [
          { label: "No relief", color: "var(--color-bar-2)", count: sum(outcomes.filter((o) => o.relief === 0)) },
          { label: "Relief", color: "var(--color-brand)", count: sum(outcomes.filter((o) => o.relief === 1)) },
          { label: "Not labeled", color: "var(--color-medium)", count: kpis.unlabeled_complaints },
        ].map((s) => ({ ...s, share: s.count / kpis.total_complaints }))
      : null;

  return (
    <Card aria-labelledby="outcome-title">
      <CardTitle id="outcome-title">Outcome</CardTitle>
      {!slices || !kpis ? (
        <Loading label="Loading outcomes" className="flex flex-1 items-center gap-5.5">
          <span className="size-34 shrink-0 animate-pulse rounded-full border-18 border-chip" />
          <span className="flex flex-1 flex-col gap-4">
            <Bone /> <Bone /> <Bone />
          </span>
        </Loading>
      ) : (
        <div className="flex flex-1 items-center gap-5.5">
          {/* The legend beside the donut carries the same numbers as text */}
          <div aria-hidden="true" className="relative size-38.5 shrink-0">
            <PieChart width={154} height={154} accessibilityLayer={false}>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="label"
                innerRadius={48}
                outerRadius={68}
                startAngle={90}
                endAngle={-270}
                stroke="var(--color-surface)"
                strokeWidth={2}
                isAnimationActive="auto"
                animationDuration={900}
                animationEasing="ease-out"
              >
                {slices.map((s) => (
                  <Cell key={s.label} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const s = active ? payload?.[0]?.payload : undefined;
                  return s ? (
                    <ChartTooltip
                      title={s.label}
                      rows={[["Complaints", formatCount(s.count)], ["Share", formatPercent(s.share)]]}
                    />
                  ) : null;
                }}
              />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[20px] leading-6 font-bold text-ink tabular-nums">
                <CountUp value={kpis.total_complaints} format={formatCount} />
              </span>
              <span className="text-10 text-ink-3">complaints</span>
            </div>
          </div>
          <ul
            className="flex min-w-0 flex-1 flex-col gap-3.5"
            aria-label={`Outcomes of ${formatCount(kpis.total_complaints)} complaints`}
          >
            {slices.map((s) => (
              <li key={s.label} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-13 leading-17 text-ink">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-3" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="text-14 text-ink-3 tabular-nums">
                  {formatCount(s.count)} · {formatPercent(s.share)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-12 text-ink-3">
        Relief = monetary or non-monetary relief. Not labeled = untimely responses, excluded from modeling.
      </p>
    </Card>
  );
}

// ---- Monthly bars

const SPLIT: Record<string, { label: string; color: string }> = {
  train: { label: "Train", color: "var(--color-bar)" },
  validation: { label: "Validation", color: "var(--color-bar-3)" },
  test: { label: "Test", color: "var(--color-brand)" },
};

function MonthTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const [month, split] = (payload?.value ?? "").split("|");
  return (
    <text x={x} y={y} textAnchor="middle" className="text-13 font-medium">
      <tspan x={x} dy={14} className="fill-ink">
        {month}
      </tspan>
      <tspan x={x} dy={17} className="fill-ink-3">
        {SPLIT[split]?.label ?? split}
      </tspan>
    </text>
  );
}

function MonthlyCard({ monthly, meta }: { monthly?: Dashboard["monthly"]; meta?: ModelMeta }) {
  const data = monthly?.map((m) => ({ ...m, key: `${formatMonth(m.month)}|${m.split}` }));
  const train = monthly?.filter((m) => m.split === "train") ?? [];
  const rates =
    monthly && meta
      ? [
          ...(train.length
            ? [{ label: `${formatMonth(train[0].month)}–${formatMonth(train[train.length - 1].month)}`, rate: meta.base_rate_train }]
            : []),
          ...monthly.filter((m) => m.split !== "train").map((m) => ({ label: formatMonth(m.month), rate: m.relief_rate })),
        ]
      : null;

  return (
    <Card aria-labelledby="monthly-title">
      <CardTitle id="monthly-title">Labeled complaints per month</CardTitle>
      {!data || !rates ? (
        <Loading label="Loading monthly complaints" className="flex h-58.75 items-end gap-5.5 px-2.75">
          {[70, 60, 62, 52].map((h) => (
            <span key={h} className="flex-1 animate-pulse rounded-t-lg bg-chip" style={{ height: `${h}%` }} />
          ))}
        </Loading>
      ) : (
        <>
          <div aria-hidden="true" className="h-58.75 min-w-0">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 235 }}>
              <BarChart data={data} margin={{ top: 22, right: 0, bottom: 0, left: 0 }} barCategoryGap={22} accessibilityLayer={false}>
                <XAxis dataKey="key" axisLine={false} tickLine={false} interval={0} height={40} tick={<MonthTick />} />
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip
                  cursor={{ fill: "var(--color-inset)", opacity: 0.6 }}
                  content={({ active, payload }) => {
                    const m = active ? payload?.[0]?.payload : undefined;
                    return m ? (
                      <ChartTooltip
                        title={`${formatMonth(m.month, true)} · ${SPLIT[m.split]?.label ?? m.split}`}
                        rows={[["Complaints", formatCount(m.complaints)], ["Relief rate", formatPercent(m.relief_rate)]]}
                      />
                    ) : null;
                  }}
                />
                <Bar
                  dataKey="complaints"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive="auto"
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {data.map((m) => (
                    <Cell key={m.month} fill={SPLIT[m.split]?.color} />
                  ))}
                  <LabelList
                    dataKey="complaints"
                    position="top"
                    offset={8}
                    formatter={(v) => formatCount(Number(v))}
                    className="fill-ink-2 text-12"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Labeled complaints and relief rate per month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Split</th>
                <th scope="col">Complaints</th>
                <th scope="col">Relief rate</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{formatMonth(m.month, true)}</th>
                  <td>{SPLIT[m.split]?.label ?? m.split}</td>
                  <td>{formatCount(m.complaints)}</td>
                  <td>{formatPercent(m.relief_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line-soft pt-1.5 text-13 leading-17 font-medium">
            <span className="text-ink-3">Relief rate</span>
            <span className="flex flex-wrap gap-x-5.5">
              {rates.map((r) => (
                <span key={r.label}>
                  <span className="text-legend">{r.label} </span>
                  <span className="text-legend-strong tabular-nums">{formatPercent(r.rate)}</span>
                </span>
              ))}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

// ---- December by priority

const CHIP_BG: Record<Tier, string> = { High: "bg-chip", Medium: "bg-chip-2", Low: "bg-chip-2" };

function PriorityCard({ kpis, testMetrics, meta, className }: {
  kpis?: Dashboard["kpis"];
  testMetrics?: Dashboard["test_metrics"];
  meta?: ModelMeta;
  className?: string;
}) {
  const month = kpis ? formatMonth(kpis.test_month, true) : "";
  const actions = meta ? Object.fromEntries(meta.tiers.map((t) => [t.tier, t.action])) : {};
  return (
    <Card aria-labelledby="priority-title" className={className}>
      <CardTitle id="priority-title">{kpis ? `${month} by priority` : "By priority"}</CardTitle>
      {!kpis || !testMetrics || !meta ? (
        <Loading label="Loading tier split" className="flex flex-col gap-3">
          <Bone className="h-3.5 rounded-7" />
          <Bone /> <Bone /> <Bone />
        </Loading>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${formatPercent(kpis.test_tier_shares.High)} of ${month} complaints are High priority`}
            className="h-3.5 overflow-hidden rounded-7 bg-inset"
          >
            <div
              className="h-full origin-left animate-grow-x rounded-7 bg-high-bar"
              style={{ width: `${kpis.test_tier_shares.High * 100}%` }}
            />
          </div>
          <ul className="flex flex-1 flex-col gap-2.75">
            {TIERS.map((tier) => (
              <li key={tier} className="flex items-center justify-between gap-3">
                <TierChip tier={tier} className={`px-2 font-medium ${CHIP_BG[tier]}`}>
                  {tier} · {actions[tier]}
                </TierChip>
                <span className="text-14 whitespace-nowrap text-ink tabular-nums">
                  {formatCount(kpis.test_tier_counts[tier])} · {formatPercent(kpis.test_tier_shares[tier])}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3.75">
            <p className="text-12 text-ink-3">
              Of the {formatCount(testMetrics.confusion.tp + testMetrics.confusion.fp)} flagged,{" "}
              {formatCount(testMetrics.confusion.tp)} actually ended in relief (precision{" "}
              {testMetrics.precision.toFixed(2)}). {formatPercent(testMetrics.recall, 0)} of all {month} relief cases
              were caught.
            </p>
            <ArrowLink href="/queue">Open high-risk queue</ArrowLink>
          </div>
        </>
      )}
    </Card>
  );
}

function ArrowLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-0.75 rounded-5 text-14 font-semibold text-brand hover:underline"
    >
      {children}
      <Icon name="arrow-right" />
    </Link>
  );
}

// ---- Highest scores table

const topColumns: Column<ScoredComplaint>[] = [
  {
    id: "id",
    header: "Complaint",
    meta: { className: "w-23", skeleton: "w-16" },
    cell: ({ row }) => (
      <Link
        href={`/queue?tier=${row.original.tier}&q=${row.original["Complaint ID"]}`}
        aria-label={`Open complaint ${row.original["Complaint ID"]} in the high-risk queue`}
        className="font-medium text-ink tabular-nums after:absolute after:inset-0 after:content-[''] hover:underline"
      >
        {row.original["Complaint ID"]}
      </Link>
    ),
  },
  {
    id: "received",
    header: "Received",
    meta: { className: "w-21", skeleton: "w-16" },
    cell: ({ row }) => formatDay(row.original["Date received"]),
  },
  {
    id: "product",
    header: "Product",
    meta: { className: "w-30", skeleton: "w-22" },
    cell: ({ row }) => <Truncate>{row.original.Product}</Truncate>,
  },
  {
    id: "company",
    header: "Company",
    meta: { className: "w-35", skeleton: "w-28" },
    cell: ({ row }) => <Truncate>{row.original.Company}</Truncate>,
  },
  {
    id: "score",
    header: "Score",
    meta: { className: "w-26.5", skeleton: "w-20" },
    cell: ({ row }) => <ScoreBar score={row.original.score} tier={row.original.tier} />,
  },
  {
    id: "tier",
    header: "Tier",
    meta: { className: "w-17", skeleton: "h-6 w-11 rounded-full" },
    cell: ({ row }) => <TierChip tier={row.original.tier} />,
  },
  {
    id: "reason",
    header: "Top reason",
    meta: { skeleton: "w-24" },
    cell: ({ row }) => <Truncate>{row.original.top_reason ?? "—"}</Truncate>,
  },
];

function TopScoresCard({ rows, loading, testMonth }: { rows?: ScoredComplaint[]; loading: boolean; testMonth: string }) {
  return (
    <Card aria-labelledby="top-title">
      <CardTitle id="top-title">Highest scores this month</CardTitle>
      <DataTable
        label={`Highest-scoring ${testMonth} complaints`}
        columns={topColumns}
        data={rows ?? []}
        getRowId={(r) => String(r["Complaint ID"])}
        minWidth={720}
        loading={loading}
        empty={<EmptyState title="No scored complaints yet">The export has no scored complaints to show.</EmptyState>}
      />
    </Card>
  );
}

// ---- Tier rules

function TierRulesCard({ meta }: { meta?: ModelMeta }) {
  return (
    <Card aria-labelledby="rules-title" className="gap-2.5">
      <CardTitle id="rules-title">How a score becomes a priority</CardTitle>
      {!meta ? (
        <Loading label="Loading tier rules" className="flex flex-col gap-2.5">
          <Bone />
          <Bone className="h-9.5 rounded-lg" />
          <Bone className="h-9.5 rounded-lg" />
          <Bone className="h-9.5 rounded-lg" />
        </Loading>
      ) : (
        <>
          <p className="text-13 text-ink-3">{meta.score_meaning}</p>
          <TierRules meta={meta} />
          <p className="text-12 text-ink-3">
            High = F1-optimal threshold on {formatMonth(meta.threshold_tuned_on, true)}. Medium = the model&apos;s
            default decision point. Values come from model_meta.json.
          </p>
          <ArrowLink href="/insights">See model insights</ArrowLink>
        </>
      )}
    </Card>
  );
}

/** The three tier rules, built from model_meta.json thresholds (never hard-coded). */
export function TierRules({ meta }: { meta: ModelMeta }) {
  const high = formatScore(meta.thresholds.high);
  const medium = formatScore(meta.thresholds.medium);
  const rules: { tier: Tier; rule: ReactNode }[] = [
    { tier: "High", rule: <>score ≥ <Value>{high}</Value></> },
    { tier: "Medium", rule: <><Value>{medium}</Value> ≤ score &lt; <Value>{high}</Value></> },
    { tier: "Low", rule: <>score &lt; <Value>{medium}</Value></> },
  ];
  return (
    <ul className="flex flex-col gap-2.5">
      {rules.map((r) => (
        <li key={r.tier} className="flex items-center justify-between gap-3 rounded-lg bg-inset p-1.75">
          <TierChip tier={r.tier} tone="tinted">
            {r.tier}
          </TierChip>
          <span className="text-right text-13 leading-17 text-rule">{r.rule}</span>
        </li>
      ))}
    </ul>
  );
}

function Value({ children }: { children: string }) {
  return <span className="text-rule-value tabular-nums">{children}</span>;
}

function sum(rows: { count: number }[]) {
  return rows.reduce((total, r) => total + r.count, 0);
}
