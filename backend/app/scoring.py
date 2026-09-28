"""Scoring through cinsight_core only: prepare_features -> model_score -> assign_tier -> explain."""
import io

import pandas as pd

from . import schemas, settings, store
from .store import core


class BatchError(Exception):
    def __init__(self, status_code, message, missing_columns=()):
        super().__init__(message)
        self.status_code = status_code
        self.detail = schemas.ErrorDetail(message=message, missing_columns=list(missing_columns))


def _score(df, **explain_options):
    X = core.prepare_features(df)
    scores = store.model_score.predict_proba(X)[:, 1]
    tiers = core.assign_tier(scores, store.HIGH, store.MEDIUM)
    explanations = core.explain(store.model_explain, X, **explain_options)
    return scores, tiers, explanations


def similar_band(score):
    """Observed relief rate for complaints that scored in the same band, or None if too few."""
    bands = store.score_bands
    for i, band in enumerate(bands.bands):
        last = i == len(bands.bands) - 1
        if band.score_from <= score < band.score_to or (last and score == band.score_to):
            if band.complaints < bands.min_reliable_count:
                return None
            return schemas.SimilarComplaints(score_from=band.score_from, score_to=band.score_to,
                                             complaints=band.complaints, relief_rate=band.relief_rate,
                                             split=bands.split)
    return None


def predict_one(complaint: schemas.ComplaintInput) -> schemas.PredictResponse:
    scores, tiers, explanations = _score(complaint.to_frame())
    score, tier = float(scores[0]), str(tiers[0])
    return schemas.PredictResponse(
        score=round(score, 4), tier=tier, action=store.ACTION[tier],
        reasons=explanations[0]["factors"], top_words=explanations[0]["top_words"],
        similar=similar_band(score),
    )


def _read_csv(data: bytes):
    """Two reads of the same text: raw strings to echo back, and pandas' default NA handling to score
    (the same way the notebook read the CFPB file)."""
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise BatchError(400, "The file isn't UTF-8 text. Save it as “CSV UTF-8” and upload it again.")
    try:
        raw = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        to_score = pd.read_csv(io.StringIO(text), dtype=str)
    except pd.errors.EmptyDataError:
        raise BatchError(400, "The file is empty.")
    except (pd.errors.ParserError, ValueError) as e:
        raise BatchError(400, f"The file couldn't be read as CSV: {e}")
    raw.columns = to_score.columns = [str(c).strip() for c in raw.columns]
    return raw, to_score


def predict_batch(data: bytes) -> schemas.BatchResponse:
    raw, to_score = _read_csv(data)

    missing = [c for c in store.meta.required_input_columns if c not in raw.columns]
    if missing:
        raise BatchError(400, f"Missing required column{'s' if len(missing) > 1 else ''}: {', '.join(missing)}",
                         missing)
    if len(raw) == 0:
        raise BatchError(400, "The file has a header but no rows.")
    if len(raw) > settings.MAX_BATCH_ROWS:
        raise BatchError(413, f"The file has {len(raw):,} rows; the limit is {settings.MAX_BATCH_ROWS:,}.")

    required = store.meta.required_input_columns
    blank = raw[required].apply(lambda col: col.str.strip() == "").all(axis=1)
    keep = ~blank
    row_numbers = pd.RangeIndex(1, len(raw) + 1)

    counts = {"High": 0, "Medium": 0, "Low": 0}
    rows = []
    if keep.any():
        scores, tiers, explanations = _score(to_score[keep].reset_index(drop=True), top_k=3)
        for number, values, score, tier, expl in zip(row_numbers[keep.values], raw[keep].to_dict("records"),
                                                     scores, tiers, explanations):
            tier = str(tier)
            counts[tier] += 1
            rows.append(schemas.BatchRow(row=int(number), values=values, score=round(float(score), 4), tier=tier,
                                         action=store.ACTION[tier], reasons=expl["factors"],
                                         top_words=expl["top_words"]))

    rejected_rows = [int(n) for n in row_numbers[blank.values]]
    return schemas.BatchResponse(columns=list(raw.columns), rows=rows, summary=schemas.TierCounts(**counts),
                                 scored=len(rows), rejected=len(rejected_rows), rejected_rows=rejected_rows)
