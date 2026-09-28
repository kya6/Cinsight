import createClient from "openapi-fetch";
import { queryOptions } from "@tanstack/react-query";
import type { components, paths } from "./api-types";

/** Types generated from the FastAPI OpenAPI spec (npm run gen:types). */
export type Schemas = components["schemas"];
export type ModelMeta = Schemas["ModelMeta"];
export type Tier = Schemas["ScoredComplaint"]["tier"];
export type ScoredComplaint = Schemas["ScoredComplaint"];
export type Reason = Schemas["Reason"];
export type ComplaintInput = Schemas["ComplaintInput"];
export type PredictResponse = Schemas["PredictResponse"];
export type BatchResponse = Schemas["BatchResponse"];
export type ComplaintPage = Schemas["ComplaintPage"];
export type FormOptions = Schemas["FormOptions"];

/** What each /api/dashboard/{name} file returns. */
export type Dashboard = {
  kpis: Schemas["Kpis"];
  outcomes: Schemas["Outcome"][];
  monthly: Schemas["MonthlyPoint"][];
  breakdowns: Schemas["Breakdowns"];
  model_comparison: Schemas["ModelComparison"];
  test_metrics: Schemas["TestMetrics"];
  pr_curve: Schemas["PrCurve"];
  calibration: Schemas["Calibration"];
  shap_importance: Schemas["ShapImportance"];
  high_risk_top: ScoredComplaint[];
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "unreachable" | "http" | "config",
    readonly status?: number,
    readonly missingColumns: string[] = [],
  ) {
    super(message);
  }
}

const client = createClient<paths>({ baseUrl: API_URL });

function errorFromBody(body: unknown, status: number) {
  const detail = (body as { detail?: unknown } | undefined)?.detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const d = detail as { message: string; missing_columns?: string[] };
    return new ApiError(d.message, "http", status, d.missing_columns ?? []);
  }
  if (Array.isArray(detail) && detail[0]?.msg) return new ApiError(String(detail[0].msg), "http", status);
  return new ApiError(`The API answered with an error (HTTP ${status}).`, "http", status);
}

async function call<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  if (!API_URL) {
    throw new ApiError("NEXT_PUBLIC_API_URL isn't set, so the app doesn't know where the API is.", "config");
  }
  let result;
  try {
    result = await request();
  } catch {
    throw new ApiError("The Cinsight API can't be reached.", "unreachable");
  }
  if (!result.response.ok || result.data === undefined) throw errorFromBody(result.error, result.response.status);
  return result.data;
}

export function getDashboard<N extends keyof Dashboard>(name: N, limit?: number): Promise<Dashboard[N]> {
  return call(() =>
    client.GET("/api/dashboard/{name}", { params: { path: { name }, query: limit ? { limit } : {} } }),
  ) as Promise<Dashboard[N]>;
}

export const getMeta = () => call(() => client.GET("/api/meta"));
export const getOptions = () => call(() => client.GET("/api/options"));
export const predict = (body: ComplaintInput) => call(() => client.POST("/api/predict", { body }));

export type ComplaintFilters = NonNullable<paths["/api/complaints"]["get"]["parameters"]["query"]>;

export const getComplaints = (query: ComplaintFilters) =>
  call(() => client.GET("/api/complaints", { params: { query } }));

/** Sends the CSV file itself as the request body; the API reads it in memory. */
export function predictBatch(file: File): Promise<BatchResponse> {
  return call(async () => {
    const response = await fetch(`${API_URL}/api/predict/batch`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: file,
    });
    const body = await response.json().catch(() => undefined);
    return response.ok ? { data: body as BatchResponse, response } : { error: body, response };
  });
}

/** Plain links: the browser downloads these directly (the export is streamed by the API). */
export function apiLink(path: "/api/sample-batch" | "/api/complaints/export", query: Record<string, unknown> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_URL ?? ""}${path}${qs ? `?${qs}` : ""}`;
}

/** Shared query definitions so every page reads the same cache entries. */
export const queries = {
  meta: () => queryOptions({ queryKey: ["meta"], queryFn: getMeta, staleTime: Infinity }),
  options: () => queryOptions({ queryKey: ["options"], queryFn: getOptions, staleTime: Infinity }),
  dashboard: <N extends keyof Dashboard>(name: N, limit?: number) =>
    queryOptions({ queryKey: ["dashboard", name, limit ?? null], queryFn: () => getDashboard(name, limit) }),
  complaints: (filters: ComplaintFilters) =>
    queryOptions({ queryKey: ["complaints", filters], queryFn: () => getComplaints(filters) }),
};
