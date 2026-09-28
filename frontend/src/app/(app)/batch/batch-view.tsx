"use client";

import { useRef, useState, type DragEvent } from "react";
import Papa from "papaparse";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardTitle, FieldLabel } from "@/components/card";
import { DataTable, Truncate, type Column } from "@/components/data-table";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Bone, EmptyState, ErrorState, Loading } from "@/components/states";
import { ScoreBar, TIERS, TierChip } from "@/components/tier";
import { Button } from "@/components/ui/button";
import { ApiError, apiLink, predictBatch, queries, type BatchResponse } from "@/lib/api";
import { formatCount, formatFactor } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Same limit as the API's MAX_UPLOAD_MB (backend/.env.example); the API enforces it too. */
const MAX_UPLOAD_MB = 10;
const PAGE_SIZE = 10;
const ADDED_COLUMNS = ["score", "tier", "action", "reason_1", "reason_2", "reason_3"];

type Row = BatchResponse["rows"][number];

/** Reads only the header row, in the browser, so a file missing columns is never uploaded. */
function readHeader(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      preview: 1,
      skipEmptyLines: true,
      complete: (result) => resolve((result.data[0] ?? []).map((c) => c.replace(/^﻿/, "").trim())),
      error: reject,
    });
  });
}

function downloadScoredCsv(result: BatchResponse, fileName: string) {
  const header = [...result.columns, ...ADDED_COLUMNS];
  const body = result.rows.map((row) => [
    ...result.columns.map((c) => row.values[c] ?? ""),
    row.score.toFixed(4),
    row.tier,
    row.action,
    ...[0, 1, 2].map((i) => row.reasons[i]?.factor ?? ""),
  ]);
  const csv = "﻿" + Papa.unparse([header, ...body]); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: fileName.replace(/\.csv$/i, "") + "-scored.csv",
  });
  link.click();
  URL.revokeObjectURL(url);
}

export function BatchView() {
  const meta = useQuery(queries.meta());
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<{ title: string; body: string; missing?: string[] } | null>(null);
  const scoring = useMutation({ mutationFn: predictBatch });

  const required = meta.data?.required_input_columns ?? [];

  const accept = async (picked: File | undefined) => {
    if (!picked) return;
    setProblem(null);
    scoring.reset();
    setFile(picked);
    if (!/\.csv$/i.test(picked.name)) {
      setProblem({ title: "That isn't a CSV file", body: "Choose a .csv file exported as CSV UTF-8." });
      return;
    }
    if (picked.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setProblem({ title: "The file is too large", body: `The limit is ${MAX_UPLOAD_MB} MB.` });
      return;
    }
    let header: string[];
    try {
      header = await readHeader(picked);
    } catch {
      setProblem({ title: "The file couldn't be read", body: "Check that it's a CSV file saved as UTF-8." });
      return;
    }
    const missing = required.filter((c) => !header.includes(c));
    if (missing.length) {
      setProblem({
        title: `Missing ${missing.length === 1 ? "a required column" : `${missing.length} required columns`}`,
        body: "Add these columns (they can be empty) and upload the file again:",
        missing,
      });
      return;
    }
    scoring.mutate(picked);
  };

  return (
    <>
      <PageHeader
        title="Batch scoring"
        description="Upload a CSV of complaints and download it back with a score, tier and top reason for every row."
      />

      {meta.isError ? (
        <ErrorState error={meta.error} onRetry={() => meta.refetch()} />
      ) : (
        <>
          <div className="grid items-stretch gap-3.5 md:gap-4 xl:grid-cols-[minmax(0,602fr)_minmax(0,502fr)]">
            <UploadCard required={required} loading={meta.isPending} busy={scoring.isPending} onFile={accept} />
            <ChecksCard />
          </div>
          <ResultsCard
            file={file}
            problem={problem}
            pending={scoring.isPending}
            error={scoring.error}
            result={scoring.data}
            onRetry={() => file && scoring.mutate(file)}
          />
        </>
      )}
    </>
  );
}

// ---- Upload

function UploadCard({ required, loading, busy, onFile }: {
  required: string[];
  loading: boolean;
  busy: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    onFile(event.dataTransfer.files[0]);
  };

  return (
    <Card aria-labelledby="upload-title" className="gap-4.5">
      <CardTitle id="upload-title">Upload</CardTitle>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-12 border border-dashed bg-inset px-6 pt-8 pb-8.5 text-center transition-colors",
          dragging ? "border-brand bg-brand-tint-2" : "border-dash",
        )}
      >
        <Icon name="upload" className="size-8 text-brand" />
        <p className="text-[15px] leading-19 font-medium text-ink">Drop a CSV file here</p>
        <input
          ref={input}
          id="batch-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = ""; // choosing the same file again should still trigger a check
          }}
        />
        <Button variant="outline" size="md" className="h-10.5 px-4.75" disabled={busy} onClick={() => input.current?.click()}>
          Browse files
        </Button>
        <p className="text-12 leading-15">
          <span className="text-legend">CSV, UTF-8, one complaint per row · max </span>
          <span className="text-rule-value">{MAX_UPLOAD_MB}</span>
          <span className="text-legend"> MB</span>
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <FieldLabel>Required columns</FieldLabel>
        {loading ? (
          <Loading label="Loading required columns" className="flex flex-wrap gap-2.5">
            {[54, 101, 79, 74, 199, 53, 48, 66, 93].map((w) => (
              <Bone key={w} className="h-6.25 rounded-full" />
            ))}
          </Loading>
        ) : (
          <ul className="flex flex-wrap gap-2.5">
            {required.map((column) => (
              <li key={column} className="rounded-full bg-chip px-2.5 py-1.25 text-12 leading-15 font-medium text-ink-2">
                {column}
              </li>
            ))}
          </ul>
        )}
      </div>

      <a
        href={apiLink("/api/sample-batch")}
        download
        className="inline-flex w-fit items-center gap-2 rounded-5 text-14 font-semibold text-brand hover:underline"
      >
        <Icon name="download-link" />
        Download sample file · sample_batch.csv
      </a>
    </Card>
  );
}

const CHECKS = [
  ["Required columns are present", "Missing columns stop the upload and are listed by name."],
  ["Dates can be read", "Rows with an unreadable date are still scored; month and weekday become “Not provided”."],
  ["New companies or categories are allowed", "They are scored as unseen values, with no effect on the score."],
  ["Empty narratives are allowed", "The score relies on the structured fields only."],
] as const;

function ChecksCard() {
  return (
    <Card aria-labelledby="checks-title" className="gap-4">
      <CardTitle id="checks-title">What gets checked</CardTitle>
      <ul className="flex flex-col gap-4">
        {CHECKS.map(([title, body]) => (
          <li key={title} className="flex items-start gap-3.25">
            <Icon name="check" className="size-4.5 text-brand" />
            <span className="flex flex-col gap-0.75 text-12 leading-15">
              <span className="text-ink">{title}</span>
              <span className="text-ink-3">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---- Results

const columns: Column<Row>[] = [
  {
    id: "id",
    header: "Complaint",
    meta: { className: "w-34.75", skeleton: "w-16" },
    cell: ({ row }) => <span className="font-medium text-ink tabular-nums">{row.original.values["Complaint ID"] ?? `Row ${row.original.row}`}</span>,
  },
  {
    id: "product",
    header: "Product",
    meta: { className: "w-55.75", skeleton: "w-30" },
    cell: ({ row }) => <Truncate>{row.original.values.Product || "Not provided"}</Truncate>,
  },
  {
    id: "company",
    header: "Company",
    meta: { className: "w-62.75", skeleton: "w-34" },
    cell: ({ row }) => <Truncate>{row.original.values.Company || "Not provided"}</Truncate>,
  },
  {
    id: "score",
    header: "Score",
    meta: { className: "w-26", skeleton: "w-18" },
    cell: ({ row }) => <ScoreBar score={row.original.score} tier={row.original.tier} />,
  },
  {
    id: "tier",
    header: "Tier",
    meta: { className: "w-24", skeleton: "h-6 w-12 rounded-full" },
    cell: ({ row }) => <TierChip tier={row.original.tier} />,
  },
  {
    id: "reason",
    header: "Top reason",
    meta: { skeleton: "w-30" },
    cell: ({ row }) => <Truncate>{formatFactor(row.original.reasons[0]?.factor ?? "—")}</Truncate>,
  },
];

const SUMMARY_BG = { High: "bg-chip", Medium: "bg-chip-2", Low: "bg-chip-2" } as const;

function ResultsCard({ file, problem, pending, error, result, onRetry }: {
  file: File | null;
  problem: { title: string; body: string; missing?: string[] } | null;
  pending: boolean;
  error: Error | null;
  result?: BatchResponse;
  onRetry: () => void;
}) {
  const [page, setPage] = useState(1);
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    setPage(1);
  }

  if (!file) {
    return (
      <Card>
        <EmptyState title="No file scored yet" className="bg-transparent py-12">
          Drop a CSV above, or download the sample file to try it out.
        </EmptyState>
      </Card>
    );
  }

  const rows = result?.rows ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const apiMissing = error instanceof ApiError ? error.missingColumns : [];

  return (
    <Card aria-labelledby="results-title" aria-busy={pending || undefined} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Icon name="file" className="size-5.5 text-ink-3" />
          <div className="flex min-w-0 flex-col gap-0.75">
            <h2 id="results-title" className="truncate text-14 text-ink">
              {file.name}
            </h2>
            <p className="text-12 leading-15 text-ink-3" aria-live="polite">
              {pending
                ? "Scoring…"
                : result
                  ? `${formatCount(result.scored)} rows scored · ${formatCount(result.rejected)} rejected`
                  : problem || error
                    ? "Not scored"
                    : ""}
            </p>
          </div>
        </div>
        {result && (
          <div className="flex flex-wrap items-center gap-2.5">
            {TIERS.map((tier) => (
              <TierChip key={tier} tier={tier} className={SUMMARY_BG[tier]}>
                {tier} <span className="text-ink-4 tabular-nums">{formatCount(result.summary[tier])}</span>
              </TierChip>
            ))}
            <Button onClick={() => downloadScoredCsv(result, file.name)} className="px-4.75 font-semibold" disabled={!result.rows.length}>
              <Icon name="download-small" className="size-3.25" />
              Download scored CSV
            </Button>
          </div>
        )}
      </div>

      {problem ? (
        <ProblemNote title={problem.title} body={problem.body} missing={problem.missing} />
      ) : error ? (
        apiMissing.length ? (
          <ProblemNote title="Missing required columns" body={error.message} missing={apiMissing} />
        ) : (
          <ErrorState error={error} onRetry={onRetry} />
        )
      ) : (
        <>
          <DataTable
            label={`Scored rows from ${file.name}`}
            columns={columns}
            data={visible}
            getRowId={(r) => String(r.row)}
            minWidth={880}
            loading={pending}
            empty={<EmptyState title="Every row was empty">The file had a header but no complaints to score.</EmptyState>}
          />
          {result && rows.length > PAGE_SIZE && (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-14 font-semibold text-ink-3">
                Showing {formatCount((page - 1) * PAGE_SIZE + 1)}–{formatCount(Math.min(page * PAGE_SIZE, rows.length))} of{" "}
                {formatCount(rows.length)}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="md" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="md" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </nav>
          )}
          {result && result.rejected > 0 && (
            <p className="text-12 text-ink-3">
              Skipped {result.rejected === 1 ? "row" : "rows"} {result.rejected_rows.slice(0, 20).join(", ")}
              {result.rejected > 20 ? "…" : ""}: every required column was blank.
            </p>
          )}
        </>
      )}

      <p className="text-12 leading-14 text-ink-3">
        The downloaded file keeps every original column and adds: {ADDED_COLUMNS.join(", ")}.{" "}
        <span className="text-ink-4">POST /api/predict/batch</span>
      </p>
    </Card>
  );
}

function ProblemNote({ title, body, missing }: { title: string; body: string; missing?: string[] }) {
  return (
    <div role="alert" className="flex flex-col gap-2.5 rounded-lg border border-high-line bg-high-bg-2 px-5 py-4">
      <p className="text-14 font-semibold text-high">{title}</p>
      <p className="text-13 text-ink-2">{body}</p>
      {missing && missing.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {missing.map((c) => (
            <li key={c} className="rounded-full bg-high-bg px-2.5 py-1.25 text-12 leading-15 font-medium text-high">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
