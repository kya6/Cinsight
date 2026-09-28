const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 81789 -> "81,789" */
export const formatCount = (n: number) => integer.format(n);

/** 0.1887 -> "18.9%" (for shares and observed rates — never for the score) */
export const formatPercent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;

/** A priority score: 0.68661 -> "0.687". Never a percentage — the score is not a calibrated probability. */
export const formatScore = (score: number, digits = 3) => score.toFixed(digits);

/** A log-odds contribution: 0.3608 -> "+0.36", -0.6182 -> "−0.62" */
export const formatContribution = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;

function parseIsoDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return y && m ? new Date(Date.UTC(y, m - 1, d || 1)) : null;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

/** Explanation labels from the API, made readable: "Received Month: 9" -> "Received month: September". */
export function formatFactor(factor: string) {
  const month = /^Received Month: (\d{1,2})$/.exec(factor);
  if (month) return `Received month: ${MONTH_NAMES[Number(month[1]) - 1] ?? month[1]}`;
  return factor
    .replace(/^Received Day of Week:/, "Received on:")
    .replace(/^Narrative Length$/, "Narrative length");
}

/** "2025-12-04" -> "Dec 4, 2025" (read as a calendar date, no timezone shift) */
export function formatDate(isoDate: string) {
  const date = parseIsoDate(isoDate);
  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : isoDate;
}

/** "2025-12-04" -> "Dec 4" */
export function formatDay(isoDate: string) {
  const date = parseIsoDate(isoDate);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : isoDate;
}

/** "2025-12" -> "Dec"; with `long`, "December" */
export function formatMonth(yearMonth: string, long = false) {
  const date = parseIsoDate(yearMonth);
  return date ? date.toLocaleDateString("en-US", { month: long ? "long" : "short", timeZone: "UTC" }) : yearMonth;
}

/** ("2025-09-01", "2025-12-31") -> "Sep–Dec 2025" */
export function formatMonthRange(from: string, to: string) {
  const [fromYear, toYear] = [from.slice(0, 4), to.slice(0, 4)];
  return fromYear === toYear
    ? `${formatMonth(from)}–${formatMonth(to)} ${toYear}`
    : `${formatMonth(from)} ${fromYear}–${formatMonth(to)} ${toYear}`;
}
