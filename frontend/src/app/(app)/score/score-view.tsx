"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardTitle } from "@/components/card";
import { ComboboxField, controlClass, Field, SelectField } from "@/components/form-fields";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Bone, EmptyState, ErrorState, Loading } from "@/components/states";
import { TierChip } from "@/components/tier";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  predict,
  queries,
  type ComplaintInput,
  type FormOptions,
  type ModelMeta,
  type PredictResponse,
  type Tier,
} from "@/lib/api";
import { formatContribution, formatCount, formatFactor, formatScore } from "@/lib/format";
import { cn } from "@/lib/utils";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the complaint was received."),
  product: z.string().min(1, "Choose a product."),
  subProduct: z.string().min(1, "Choose a sub-product."),
  issue: z.string().min(1, "Choose an issue."),
  subIssue: z.string().min(1, "Choose a sub-issue."),
  company: z.string().min(1, "Choose a company."),
  state: z.string(),
  tags: z.string(),
  narrative: z.string().max(100_000, "The narrative is too long."),
});
type FormValues = z.infer<typeof schema>;

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export function ScoreView() {
  const options = useQuery(queries.options());
  const meta = useQuery(queries.meta());
  const scoring = useMutation({ mutationFn: predict });

  const failed = options.isError ? options : meta.isError ? meta : null;

  return (
    <>
      <PageHeader
        title="Score a complaint"
        description="Enter what the consumer submitted. Nothing is stored: the score is computed and shown."
      />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => failed.refetch()} />
      ) : (
        <div className="grid items-start gap-3.5 md:gap-4 xl:grid-cols-[minmax(0,565fr)_minmax(0,538fr)]">
          {options.data ? (
            <ScoreForm
              options={options.data}
              pending={scoring.isPending}
              onSubmit={(input) => scoring.mutate(input)}
              onClear={() => scoring.reset()}
            />
          ) : (
            <FormSkeleton />
          )}
          <div className="flex flex-col gap-3.5 md:gap-4" aria-live="polite">
            {scoring.isPending ? (
              <ResultSkeleton />
            ) : scoring.isError ? (
              <ErrorState error={scoring.error} onRetry={() => scoring.mutate(scoring.variables)} />
            ) : scoring.data && meta.data ? (
              <>
                <ResultCard result={scoring.data} meta={meta.data} />
                <WhyCard result={scoring.data} />
              </>
            ) : (
              <Card>
                <EmptyState title="No score yet" className="bg-transparent py-16">
                  Fill in the complaint details and select Score complaint to see its {meta.data?.score_label.toLowerCase() ?? "score"},
                  its tier and what drove it.
                </EmptyState>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---- Form

function ScoreForm({ options, pending, onSubmit, onClear }: {
  options: FormOptions;
  pending: boolean;
  onSubmit: (input: ComplaintInput) => void;
  onClear: () => void;
}) {
  const missing = options.missing_label;
  const defaults: FormValues = {
    date: today(),
    product: "",
    subProduct: "",
    issue: "",
    subIssue: "",
    company: "",
    state: missing,
    tags: missing,
    narrative: "",
  };
  const { control, register, handleSubmit, setValue, reset, formState: { errors, isSubmitted } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const [product, subProduct, issue, narrative] = useWatch({ control, name: ["product", "subProduct", "issue", "narrative"] });

  const h = options.hierarchy;
  const subProducts = product ? Object.keys(h[product] ?? {}) : [];
  const issues = product && subProduct ? Object.keys(h[product]?.[subProduct] ?? {}) : [];
  const subIssues = product && subProduct && issue ? (h[product]?.[subProduct]?.[issue] ?? []) : [];
  const companies = useMemo(() => options.companies.map((c) => c.name), [options.companies]);

  // Cascading choices: a new parent clears its children, and a single child choice is picked for you
  const pick = (field: "subProduct" | "issue" | "subIssue", choices: string[]) =>
    setValue(field, choices.length === 1 ? choices[0] : "", { shouldValidate: isSubmitted });
  const onProduct = (value: string) => {
    setValue("product", value, { shouldValidate: true });
    const subs = Object.keys(h[value] ?? {});
    pick("subProduct", subs);
    setValue("issue", "");
    setValue("subIssue", "");
    if (subs.length === 1) pick("issue", Object.keys(h[value][subs[0]]));
  };
  const onSubProduct = (value: string) => {
    setValue("subProduct", value, { shouldValidate: true });
    pick("issue", Object.keys(h[product]?.[value] ?? {}));
    setValue("subIssue", "");
  };
  const onIssue = (value: string) => {
    setValue("issue", value, { shouldValidate: true });
    pick("subIssue", h[product]?.[subProduct]?.[value] ?? []);
  };

  const submit = handleSubmit((v) =>
    onSubmit({
      "Date received": v.date,
      "Consumer complaint narrative": v.narrative.trim() || null,
      Product: v.product,
      "Sub-product": v.subProduct,
      Issue: v.issue,
      "Sub-issue": v.subIssue,
      Company: v.company,
      State: v.state,
      Tags: v.tags,
    }),
  );

  const describe = (id: string, error?: unknown, hint = false) =>
    error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <Card aria-labelledby="details-title" className="gap-4.5">
      <CardTitle id="details-title">Complaint details</CardTitle>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4.5">
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 sm:gap-y-4.5">
          <Field id="date" label="Date received" hint="Used for the month and day of the week" error={errors.date?.message}>
            <input
              id="date"
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date || undefined}
              aria-describedby={describe("date", errors.date, true)}
              className={cn(controlClass, "[color-scheme:dark]")}
            />
          </Field>

          <Field id="product" label="Product" error={errors.product?.message}>
            <SelectField
              id="product"
              value={product}
              onChange={onProduct}
              options={Object.keys(h).map((value) => ({ value }))}
              placeholder="Choose a product"
              invalid={!!errors.product}
              describedBy={describe("product", errors.product)}
            />
          </Field>

          <Field id="subProduct" label="Sub-product" hint="Options depend on product" error={errors.subProduct?.message}>
            <SelectField
              id="subProduct"
              value={subProduct}
              onChange={onSubProduct}
              options={subProducts.map((value) => ({ value }))}
              placeholder={product ? "Choose a sub-product" : "Choose a product first"}
              disabled={!product}
              invalid={!!errors.subProduct}
              describedBy={describe("subProduct", errors.subProduct, true)}
            />
          </Field>

          <Field id="issue" label="Issue" error={errors.issue?.message}>
            <SelectField
              id="issue"
              value={issue}
              onChange={onIssue}
              options={issues.map((value) => ({ value }))}
              placeholder={subProduct ? "Choose an issue" : "Choose a sub-product first"}
              disabled={!subProduct}
              invalid={!!errors.issue}
              describedBy={describe("issue", errors.issue)}
            />
          </Field>

          <Controller
            control={control}
            name="subIssue"
            render={({ field, fieldState }) => (
              <Field id="subIssue" label="Sub-issue" error={fieldState.error?.message}>
                <SelectField
                  id="subIssue"
                  value={field.value}
                  onChange={field.onChange}
                  options={subIssues.map((value) => ({ value }))}
                  placeholder={issue ? "Choose a sub-issue" : "Choose an issue first"}
                  disabled={!issue}
                  invalid={!!fieldState.error}
                  describedBy={describe("subIssue", fieldState.error)}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="company"
            render={({ field, fieldState }) => (
              <Field id="company" label="Company" hint="Type to search companies seen in training" error={fieldState.error?.message}>
                <ComboboxField
                  id="company"
                  value={field.value}
                  onChange={field.onChange}
                  options={companies}
                  placeholder="Choose a company"
                  searchPlaceholder="Search companies…"
                  invalid={!!fieldState.error}
                  describedBy={describe("company", fieldState.error, true)}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="state"
            render={({ field }) => (
              <Field id="state" label="State">
                <SelectField
                  id="state"
                  value={field.value}
                  onChange={field.onChange}
                  options={[missing, ...options.states.filter((s) => s !== missing)].map((value) => ({ value }))}
                  placeholder="Choose a state"
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <Field id="tags" label="Tags">
                <SelectField
                  id="tags"
                  value={field.value}
                  onChange={field.onChange}
                  options={options.tags.map((value) => ({ value }))}
                  placeholder="Choose tags"
                />
              </Field>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="narrative" className="text-13 leading-17 font-medium text-ink-2">
            Complaint narrative
          </label>
          <p id="narrative-hint" className="text-12 leading-15 text-ink-4">
            Optional, but the score is more reliable with it
          </p>
          <Textarea
            id="narrative"
            {...register("narrative")}
            aria-describedby="narrative-hint narrative-count"
            rows={4}
            className={cn(controlClass, "h-auto min-h-28 resize-y py-3.5 text-14 leading-21 font-medium md:text-14")}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="narrative-count" className="text-12 leading-15 text-ink-4">
            {formatCount(narrative.length)} characters
          </p>
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset({ ...defaults, date: today() });
                onClear();
              }}
            >
              Clear
            </Button>
            <Button type="submit" disabled={pending} className="px-5">
              {pending ? "Scoring…" : "Score complaint"}
              <Icon name="arrow-right" />
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function FormSkeleton() {
  return (
    <Card>
      <CardTitle>Complaint details</CardTitle>
      <Loading label="Loading form options" className="grid gap-4.5 sm:grid-cols-2">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="flex flex-col gap-2">
            <Bone className="w-24" />
            <Bone className="h-11.5 rounded-lg" />
          </span>
        ))}
      </Loading>
    </Card>
  );
}

// ---- Result

const RESULT_BORDER: Record<Tier, string> = {
  High: "border-high-line",
  Medium: "border-medium-bg",
  Low: "border-line",
};
const RING_STROKE: Record<Tier, string> = { High: "stroke-high-bar", Medium: "stroke-medium", Low: "stroke-bar-3" };

function ScoreRing({ score, tier, label }: { score: number; tier: Tier; label: string }) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={`${label} ${formatScore(score)} out of 1`} className="relative size-18.25 shrink-0">
      <svg viewBox="0 0 73 73" className="size-full -rotate-90">
        <circle cx="36.5" cy="36.5" r={r} fill="none" strokeWidth="6" className="stroke-chip" />
        <circle
          cx="36.5"
          cy="36.5"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${score * circumference} ${circumference}`}
          className={RING_STROKE[tier]}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-13 font-semibold text-ink tabular-nums">
        {formatScore(score)}
      </span>
    </div>
  );
}

function similarSentence(result: PredictResponse) {
  const band = result.similar;
  if (!band) return null;
  const inTen = band.relief_rate * 10;
  const amount = inTen < 0.5 ? "fewer than 1" : `about ${Math.round(inTen)}`;
  return ` Similar complaints ended in relief ${amount} in 10 times.`;
}

function ResultCard({ result, meta }: { result: PredictResponse; meta: ModelMeta }) {
  const high = formatScore(meta.thresholds.high);
  const medium = formatScore(meta.thresholds.medium);
  const score = <Num>{formatScore(result.score)}</Num>;
  const position = {
    High: <>, above the high-priority threshold of <Num>{high}</Num>.</>,
    Medium: <>, between the monitor threshold of <Num>{medium}</Num> and the high-priority threshold of <Num>{high}</Num>.</>,
    Low: <>, below the monitor threshold of <Num>{medium}</Num>.</>,
  }[result.tier];

  return (
    <section
      aria-labelledby="result-title"
      className={cn("flex items-center gap-5 rounded-card border bg-result px-5.25 py-8 sm:gap-6.5", RESULT_BORDER[result.tier])}
    >
      <ScoreRing score={result.score} tier={result.tier} label={meta.score_label} />
      <div className="flex min-w-0 flex-col gap-2.75">
        <h2 id="result-title" className="text-12 leading-15 font-semibold tracking-label text-ink-3">
          Result
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <TierChip tier={result.tier} tone="tinted" className="px-3.5 py-1.5 text-14 leading-18">
            {result.tier} priority
          </TierChip>
          <span className="rounded-full bg-chip-dark px-2.5 py-1.25 text-12 leading-15 font-semibold text-ink-2">
            {result.action}
          </span>
        </div>
        <p className="text-14 leading-21 text-rule">
          {meta.score_label} is {score}
          {position}
          {similarSentence(result)}
        </p>
      </div>
    </section>
  );
}

function Num({ children }: { children: string }) {
  return <span className="text-rule-value tabular-nums">{children}</span>;
}

/** Contributions toward relief in brand green, away from relief in coral, around a zero line. */
function WhyCard({ result }: { result: PredictResponse }) {
  const max = Math.max(...result.reasons.map((r) => Math.abs(r.contribution)), 0.01);
  return (
    <Card aria-labelledby="why-title" className="gap-4.5">
      <CardTitle id="why-title">Why this score</CardTitle>
      <div aria-hidden="true" className="flex justify-between text-12 leading-15 text-ink-3">
        <span>← away from relief</span>
        <span>toward relief →</span>
      </div>
      <ul className="flex flex-col gap-4.5">
        {result.reasons.map((reason) => {
          const toward = reason.contribution > 0;
          const half = (Math.abs(reason.contribution) / max) * 40; // % of the full bar; the largest reaches 80% of its side
          return (
            <li key={reason.factor} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3 text-13 leading-17">
                <span className="min-w-0 break-words text-ink">{formatFactor(reason.factor)}</span>
                <span className="shrink-0 text-ink-4 tabular-nums">
                  {formatContribution(reason.contribution)}
                  <span className="sr-only"> ({reason.direction})</span>
                </span>
              </div>
              <div aria-hidden="true" className="relative h-2.5 rounded-5 bg-inset">
                <span
                  className={cn("absolute inset-y-0", toward ? "left-1/2 rounded-r-5 bg-brand" : "right-1/2 rounded-l-5 bg-high-bar")}
                  style={{ width: `${half}%` }}
                />
                <span className="absolute -top-0.5 left-1/2 h-3.5 w-px bg-axis" />
              </div>
              {reason.factor === "Narrative wording" && result.top_words.length > 0 && (
                <p className="text-12 leading-15">
                  <span className="text-legend">Top words: </span>
                  <span className="text-rule">{result.top_words.join(" · ")}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-12 text-ink-3">
        Each bar is how much that input moved the score for this complaint, compared with an empty complaint.
      </p>
    </Card>
  );
}

function ResultSkeleton() {
  return (
    <>
      <Loading label="Scoring the complaint" className="flex items-center gap-6.5 rounded-card border border-line bg-result px-5.25 py-8">
        <span className="size-18.25 shrink-0 animate-pulse rounded-full border-6 border-chip" />
        <span className="flex flex-1 flex-col gap-3">
          <Bone className="w-16" />
          <Bone className="h-7.5 w-40 rounded-full" />
          <Bone />
          <Bone className="w-3/4" />
        </span>
      </Loading>
      <Card>
        <CardTitle>Why this score</CardTitle>
        <div className="flex flex-col gap-5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="flex flex-col gap-2">
              <Bone className="w-1/3" />
              <Bone />
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}
