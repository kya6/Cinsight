"""High-risk queue: filter, paginate and export the scored December complaints."""
import csv
import io
from datetime import date

import pandas as pd

from . import schemas, store

EXPORT_COLUMNS = ["Complaint ID", "Date received", "Product", "Sub-product", "Issue", "Sub-issue", "Company",
                  "State", "Tags", "score", "tier", "action", "reason_1", "reason_2", "reason_3", "top_words",
                  "narrative_preview"]
EXPORT_CHUNK = 1000


def filter_complaints(tier: str | None = None, product: str | None = None, company: str | None = None,
                      date_from: date | None = None, date_to: date | None = None, q: str | None = None):
    """-> (rows matching every filter, tier counts over every filter except tier). Order stays score-descending."""
    df = store.complaints
    mask = pd.Series(True, index=df.index)
    if product:
        mask &= df["Product"] == product
    if company:
        mask &= df["Company"] == company
    if date_from:
        mask &= store.received >= date_from
    if date_to:
        mask &= store.received <= date_to
    if q and q.strip():
        term = q.strip().lower()
        hit = store.search_narrative.str.contains(term, regex=False) | store.search_company.str.contains(term, regex=False)
        if term.isdigit():
            hit |= store.search_id.str.startswith(term)
        mask &= hit

    matched = df[mask]
    counts = matched["tier"].value_counts()
    tier_counts = schemas.TierCounts(**{t: int(counts.get(t, 0)) for t in ("High", "Medium", "Low")})
    if tier:
        matched = matched[matched["tier"] == tier]
    return matched, tier_counts


def page(rows: pd.DataFrame, number: int, size: int) -> list[dict]:
    start = (number - 1) * size
    return rows.iloc[start:start + size].to_dict("records")


def export_csv(rows: pd.DataFrame):
    """Yield the CSV in chunks so the whole file is never built in memory."""
    buf = io.StringIO()
    writer = csv.writer(buf)

    def flush():
        text = buf.getvalue()
        buf.seek(0)
        buf.truncate()
        return text

    buf.write("﻿")                     # BOM so Excel opens UTF-8 correctly
    writer.writerow(EXPORT_COLUMNS)
    yield flush()
    for start in range(0, len(rows), EXPORT_CHUNK):
        for rec in rows.iloc[start:start + EXPORT_CHUNK].to_dict("records"):
            factors = [r["factor"] for r in rec["reasons"]] + ["", "", ""]
            writer.writerow([rec[c] for c in EXPORT_COLUMNS[:12]] + factors[:3]
                            + [", ".join(rec["top_words"]), rec["narrative_preview"]])
        yield flush()
