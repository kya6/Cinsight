"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle, FieldLabel } from "@/components/card";
import { ChartTooltip } from "@/components/chart-tooltip";
import { CountUp } from "@/components/count-up";
import { PageHeader } from "@/components/page-header";
import { Bone, ErrorState, Loading } from "@/components/states";
import { queries, type Dashboard, type ModelMeta } from "@/lib/api";
import { formatCount, formatMonth, formatPercent, formatScore } from "@/lib/format";
import { cn } from "@/lib/utils";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function InsightsView() {
  const meta = useQuery(queries.meta());
  const test = useQuery(queries.dashboard("test_metrics"));
  const comparison = useQuery(queries.dashboard("model_comparison"));
  const pr = useQuery(queries.dashboard("pr_curve"));
  const shap = useQuery(queries.dashboard("shap_importance"));
  const monthly = useQuery(queries.dashboard("monthly"));

  const all = [meta, test, comparison, pr, shap, monthly];
  const failed = all.find((q) => q.isError);
  const testMonth = meta.data ? formatMonth(meta.data.tested_on, true) : "test-month";

  return (
    <>
      <PageHeader
        title="Model insights"
        description={`How the model was built, and how it performed on ${capitalize(testMonth)} complaints it had never seen.`}
      />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => all.forEach((q) => q.refetch())} />
      ) : (
        <>
          <MetricCards meta={meta.data} test={test.data} comparison={comparison.data} />
          <div className="grid items-start gap-3.5 md:gap-4 xl:grid-cols-[minmax(0,624fr)_minmax(0,480fr)] xl:items-stretch">
            <ComparisonCard meta={meta.data} comparison={comparison.data} />
            <ConfusionCard meta={meta.data} test={test.data} />
          </div>
          <div className="grid items-start gap-3.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3 xl:items-stretch">
            <ShapCard shap={shap.data} testMonth={testMonth} />
            <PrCurveCard pr={pr.data} test={test.data} testMonth={testMonth} />
            <EvaluationCard
              meta={meta.data}
              test={test.data}
              monthly={monthly.data}
              className="md:col-span-2 xl:col-span-1"
            />
          </div>
        </>
      )}
    </>
  );
}

// ---- Metric cards

function MetricCards({ meta, test, comparison }: {
  meta?: ModelMeta;
  test?: Dashboard["test_metrics"];
  comparison?: Dashboard["model_comparison"];
}) {
  const ready = meta && test && comparison;
  const dec = meta ? formatMonth(meta.tested_on) : "";
  const nov = meta ? formatMonth(meta.threshold_tuned_on) : "";
  const twoDecimals = (n: number) => n.toFixed(2);
  const cards = ready
    ? [
        { label: `Precision · ${dec}`, value: test.precision, format: twoDecimals, caption: "of flagged complaints ended in relief" },
        { label: `Recall · ${dec}`, value: test.recall, format: twoDecimals, caption: `of ${formatMonth(meta.tested_on, true)} relief cases were flagged` },
        { label: `F1 · ${dec}`, value: test.f1, format: twoDecimals, caption: "balance of precision and recall" },
        {
          label: `Accuracy · ${dec}`,
          value: test.accuracy,
          format: twoDecimals,
          caption: `vs ${(1 - test.positive_rate).toFixed(2)} by always predicting “no relief”`,
        },
        {
          label: `PR-AUC · ${nov}`,
          value: test.validation.pr_auc,
          format: (n: number) => n.toFixed(3),
          valueClass: "text-brand",
          caption: `${(test.validation.pr_auc / comparison.positive_rate).toFixed(1)}× the ${comparison.positive_rate.toFixed(3)} baseline`,
        },
      ]
    : null;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 md:gap-4 xl:grid-cols-5">
      {(cards ?? Array.from({ length: 5 }, () => null)).map((card, i) => (
        <Card key={card?.label ?? i} className={cn("gap-2.5", i === 4 && "sm:col-span-2 xl:col-span-1")}>
          {card ? (
            <>
              <h2 className="text-12 leading-15 font-semibold tracking-label text-ink-3 uppercase">{card.label}</h2>
              <p className={cn("text-34 font-semibold tabular-nums", card.valueClass ?? "text-ink")}>
                <CountUp value={card.value} format={card.format} />
              </p>
              <p className="text-13 leading-17 text-ink-3">{card.caption}</p>
            </>
          ) : (
            <Loading label="Loading test metrics" className="flex flex-col gap-3">
              <Bone className="w-24" />
              <Bone className="h-8 w-20" />
              <Bone className="w-4/5" />
            </Loading>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---- Model comparison

/** "Combined (feature-level LR)" -> "Combined — feature-level LR" */
const modelName = (name: string) => name.replace(/\s*\((.+)\)\s*$/, " — $1");

function ComparisonCard({ meta, comparison }: { meta?: ModelMeta; comparison?: Dashboard["model_comparison"] }) {
  const month = meta ? formatMonth(meta.threshold_tuned_on, true) : "validation";
  if (!comparison) {
    return (
      <Card>
        <CardTitle>Model comparison</CardTitle>
        <Loading label="Loading the model comparison" className="flex flex-col gap-5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="flex flex-col gap-2">
              <Bone className="w-1/3" />
              <Bone className="h-3" />
            </span>
          ))}
        </Loading>
      </Card>
    );
  }
  const isBaseline = (name: string) => /^baseline/i.test(name);
  const candidates = comparison.models.filter((m) => !isBaseline(m.model));
  const selected = candidates.reduce((best, m) => (m.pr_auc > best.pr_auc ? m : best), candidates[0]);
  const scaleMax = Math.ceil(Math.max(...comparison.models.map((m) => m.pr_auc)) * 10) / 10 + 0.1;

  return (
    <Card aria-labelledby="comparison-title" className="gap-4">
      <CardTitle id="comparison-title">Model comparison · PR-AUC on {month}</CardTitle>
      <ul className="flex flex-col gap-4">
        {comparison.models.map((m, i) => {
          const chosen = m === selected;
          const baseline = isBaseline(m.model);
          return (
            <li key={m.model} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 text-13 leading-17">
                <span className="flex min-w-0 flex-wrap items-center gap-2.25">
                  <span className={cn(chosen ? "font-semibold text-ink" : "text-ink-2")}>{modelName(m.model)}</span>
                  {chosen && (
                    <span className="rounded-full bg-brand-tint px-2.5 py-0.75 font-semibold text-brand">Selected</span>
                  )}
                  {baseline && (
                    <span className="rounded-full bg-chip px-2.5 py-0.75 text-12 leading-15 font-semibold text-ink-2">
                      Baseline
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-ink tabular-nums">{formatScore(m.pr_auc)}</span>
              </div>
              <div aria-hidden="true" className="h-3 overflow-hidden rounded-5 bg-inset">
                <div
                  className={cn("h-full origin-left animate-grow-x rounded-[6px]", chosen ? "bg-brand" : "bg-bar-3")}
                  style={{ width: `${(m.pr_auc / scaleMax) * 100}%`, animationDelay: `${i * 70}ms` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-12 text-ink-3">
        The combined model was chosen: it ties with LightGBM and is the only one that can explain each individual score.
        The baseline always predicts the majority class, so its PR-AUC equals the relief rate.
      </p>
    </Card>
  );
}

// ---- Confusion matrix

function ConfusionCard({ meta, test }: { meta?: ModelMeta; test?: Dashboard["test_metrics"] }) {
  const month = meta ? formatMonth(meta.tested_on, true) : "";
  const cells = test
    ? [
        { label: "True negative", value: test.confusion.tn, caption: "correctly left in queue", correct: true },
        { label: "False positive", value: test.confusion.fp, caption: "flagged, no relief", correct: false },
        { label: "False negative", value: test.confusion.fn, caption: "relief case missed", correct: false },
        { label: "True positive", value: test.confusion.tp, caption: "relief case caught", correct: true },
      ]
    : null;
  return (
    <Card aria-labelledby="confusion-title">
      <CardTitle id="confusion-title">
        {test ? `${month} results · ${formatCount(test.n)} complaints` : "Test results"}
      </CardTitle>
      {cells ? (
        <ul
          className="grid grid-cols-2 gap-2.5 xl:flex-1 xl:auto-rows-fr"
          aria-label="Confusion matrix at the high-priority threshold"
        >
          {cells.map((cell) => (
            <li
              key={cell.label}
              className={cn("flex flex-col gap-1 rounded-lg p-4", cell.correct ? "bg-brand-tint-2" : "bg-high-bg-2")}
            >
              <span className={cn("text-12 leading-15", cell.correct ? "text-brand-soft" : "text-high")}>{cell.label}</span>
              <span className="text-28 font-semibold text-ink tabular-nums">
                <CountUp value={cell.value} format={formatCount} />
              </span>
              <span className="text-12 leading-15 text-ink-3">{cell.caption}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Loading label="Loading the confusion matrix" className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-26.5 rounded-lg" />
          ))}
        </Loading>
      )}
    </Card>
  );
}

// ---- SHAP groups

const GROUP_LABEL: Record<string, string> = {
  Narrative: "Narrative wording",
  "Narrative Length": "Narrative length",
  "Received Month": "Received month",
  "Received Day of Week": "Day of week",
};

function ShapCard({ shap, testMonth }: { shap?: Dashboard["shap_importance"]; testMonth: string }) {
  const sample = shap?.method.match(/([\d,]+)\s+\w+\s+complaints/)?.[1];
  const groups = shap ? [...shap.by_group].sort((a, b) => b.share - a.share) : [];
  const max = Math.max(...groups.map((g) => g.share), 0.01);
  return (
    <Card aria-labelledby="shap-title">
      <CardTitle id="shap-title">What drives the score</CardTitle>
      {!shap ? (
        <Loading label="Loading feature importance" className="flex flex-col gap-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Bone key={i} />
          ))}
        </Loading>
      ) : (
        <>
          <p className="text-12 text-ink-3">
            Average SHAP impact by input
            {sample ? `, on ${sample} ${capitalize(testMonth)} complaints` : ""}. Shares add up to 100%.
          </p>
          <ul className="flex flex-col gap-3">
            {groups.map((g, i) => (
              <li key={g.group} className="flex items-center justify-between gap-3 text-12 leading-15">
                <span className="min-w-0 text-ink-2">{GROUP_LABEL[g.group] ?? g.group}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span aria-hidden="true" className="h-2.5 w-22.5 overflow-hidden rounded-5 bg-inset">
                    <span
                      className="block h-full origin-left animate-grow-x rounded-5 bg-bar-3"
                      style={{ width: `${(g.share / max) * 88}%`, animationDelay: `${i * 50}ms` }}
                    />
                  </span>
                  <span className="w-8 text-right text-ink-4 tabular-nums">{formatPercent(g.share, 0)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ---- Precision-recall curve

function PrCurveCard({ pr, test, testMonth }: {
  pr?: Dashboard["pr_curve"];
  test?: Dashboard["test_metrics"];
  testMonth: string;
}) {
  const points = pr ? [...pr.test].sort((a, b) => a.recall - b.recall) : [];
  const chosen = pr
    ? pr.test.reduce((best, p) =>
        Math.abs(p.threshold - pr.high_threshold) < Math.abs(best.threshold - pr.high_threshold) ? p : best,
      )
    : null;

  return (
    <Card aria-labelledby="pr-title">
      <CardTitle id="pr-title">Precision vs recall</CardTitle>
      {!pr || !test || !chosen ? (
        <Loading label="Loading the precision-recall curve">
          <Bone className="h-61.5 rounded-lg" />
        </Loading>
      ) : (
        <>
          <div aria-hidden="true" className="h-61.5 xl:h-auto xl:min-h-61.5 xl:flex-1">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 318, height: 246 }}>
              <LineChart data={points} margin={{ top: 22, right: 10, bottom: 22, left: 4 }} accessibilityLayer={false}>
                <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="recall"
                  domain={[0, 1]}
                  ticks={[0, 0.5, 1]}
                  tickLine={false}
                  stroke="var(--color-bar-2)"
                  tick={{ fill: "var(--color-ink-3)", fontSize: 10 }}
                  label={{ value: "Recall", position: "bottom", offset: 4, fill: "var(--color-ink-3)", fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  domain={[0, 1]}
                  ticks={[0, 0.5, 1]}
                  tickLine={false}
                  width={34}
                  stroke="var(--color-bar-2)"
                  tick={{ fill: "var(--color-ink-3)", fontSize: 10 }}
                  label={{ value: "Precision", angle: -90, position: "insideLeft", offset: 6, fill: "var(--color-ink-3)", fontSize: 12, dy: 28 }}
                />
                <ReferenceLine
                  y={test.baseline_pr_auc}
                  stroke="var(--color-ink-4)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: "baseline", position: "insideBottomLeft", fill: "var(--color-ink-4)", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ stroke: "var(--color-line)" }}
                  content={({ active, payload }) => {
                    const p = active ? payload?.[0]?.payload : undefined;
                    return p ? (
                      <ChartTooltip
                        title={`Threshold ${formatScore(p.threshold)}`}
                        rows={[["Precision", p.precision.toFixed(2)], ["Recall", p.recall.toFixed(2)]]}
                      />
                    ) : null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="precision"
                  stroke="var(--color-brand)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive="auto"
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
                <ReferenceDot
                  x={chosen.recall}
                  y={chosen.precision}
                  r={6}
                  fill="var(--color-inset)"
                  stroke="var(--color-high-bar)"
                  strokeWidth={3}
                  label={{ value: "chosen threshold", position: "top", offset: 12, fill: "var(--color-high)", fontSize: 10 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="sr-only">
            At the chosen threshold of {formatScore(pr.high_threshold)}, precision is {chosen.precision.toFixed(2)} and
            recall is {chosen.recall.toFixed(2)}, against a baseline precision of {test.baseline_pr_auc.toFixed(2)}.
          </p>
          <p className="text-12 text-ink-3">
            {capitalize(testMonth)} complaints, drawn from the export. Moving right along the curve (a lower threshold)
            catches more relief cases but flags more that won&apos;t get relief.
          </p>
        </>
      )}
    </Card>
  );
}

// ---- Data and evaluation

function EvaluationCard({ meta, test, monthly, className }: {
  meta?: ModelMeta;
  test?: Dashboard["test_metrics"];
  monthly?: Dashboard["monthly"];
  className?: string;
}) {
  if (!meta || !test || !monthly) {
    return (
      <Card className={className}>
        <CardTitle>Data and evaluation</CardTitle>
        <Loading label="Loading evaluation details" className="flex flex-col gap-3">
          <Bone className="h-9.25 rounded-md" />
          <Bone />
          <Bone className="w-3/4" />
        </Loading>
      </Card>
    );
  }
  const trainMonths = meta.trained_on.split(",").map((m) => m.trim());
  const trainLabel = `${formatMonth(trainMonths[0])}${trainMonths.length > 1 ? `–${formatMonth(trainMonths[trainMonths.length - 1])}` : ""}`;
  const val = formatMonth(meta.threshold_tuned_on);
  const testLabel = formatMonth(meta.tested_on);
  const inTen = Math.round(test.precision * 10);
  const monthsWord = NUMBER_WORDS[monthly.length] ?? String(monthly.length);
  const trainedMonthNames = trainMonths.map((m) => formatMonth(m, true)).join(" and ");

  const limitations = [
    `About ${inTen} in 10 flagged complaints end in relief — use the score to order reviews, not to decide outcomes.`,
    ...(meta.calibrated ? [] : [`${meta.score_label} is a ranking, not a calibrated probability.`]),
    `${capitalize(monthsWord)} months of data; seasonal patterns aren't captured.`,
    `The model only saw ${trainedMonthNames} in training, and those months lower the score; complaints from other months get no month effect.`,
    "Companies not seen in training get no company effect.",
  ];

  return (
    <Card aria-labelledby="evaluation-title" className={className}>
      <CardTitle id="evaluation-title">Data and evaluation</CardTitle>
      <ol aria-label="Chronological split" className="flex overflow-hidden rounded-md text-12 leading-15 font-semibold">
        <li className="flex-1 bg-bar px-2 py-2.75 text-center text-ink">Train · {trainLabel}</li>
        <li className="flex-1 bg-bar-3 px-2 py-2.75 text-center text-ink">Val · {val}</li>
        <li className="flex-1 bg-brand px-2 py-2.75 text-center text-on-brand">Test · {testLabel}</li>
      </ol>
      <p className="text-13 text-ink-3">
        Split by date, so every evaluation is on complaints received after training. {formatMonth(meta.threshold_tuned_on, true)}{" "}
        sets the thresholds; {formatMonth(meta.tested_on, true)} was used once.
      </p>
      <FieldLabel>Limitations</FieldLabel>
      <ul className="flex list-disc flex-col gap-2 pl-4.5 text-13 text-ink-2 marker:text-ink-4">
        {limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </Card>
  );
}
