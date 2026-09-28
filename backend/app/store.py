"""Everything the API serves, loaded once at import time — never per request.

Each JSON file is validated against its schema here, so a changed export fails at startup
instead of on a user's screen.
"""
import json
import sys

import joblib
import pandas as pd
from pydantic import TypeAdapter

from . import schemas, settings

ART = settings.ARTIFACTS_DIR

# The notebook's own module, imported as-is. Never copy or edit it here.
sys.path.insert(0, str(ART))
import cinsight_core as core  # noqa: E402


def _read_json(name):
    return json.loads((ART / name).read_text(encoding="utf-8"))


meta = schemas.ModelMeta.model_validate(_read_json("model_meta.json"))
HIGH, MEDIUM = meta.thresholds.high, meta.thresholds.medium
ACTION = {t.tier: t.action for t in meta.tiers}

model_score = joblib.load(ART / "model_score.joblib")        # scores
model_explain = joblib.load(ART / "model_explain.joblib")    # used only by core.explain

form_options = schemas.FormOptions.model_validate(_read_json("form_options.json"))
score_bands = schemas.ScoreBands.model_validate(_read_json("score_bands.json"))

# /api/dashboard/{name} -> schema of <name>.json
DASHBOARD = {
    "kpis": schemas.Kpis,
    "outcomes": list[schemas.Outcome],
    "monthly": list[schemas.MonthlyPoint],
    "breakdowns": schemas.Breakdowns,
    "model_comparison": schemas.ModelComparison,
    "test_metrics": schemas.TestMetrics,
    "pr_curve": schemas.PrCurve,
    "calibration": schemas.Calibration,
    "shap_importance": schemas.ShapImportance,
    "high_risk_top": list[schemas.ScoredComplaint],
}
dashboard_adapters = {name: TypeAdapter(tp) for name, tp in DASHBOARD.items()}
dashboard_data = {name: dashboard_adapters[name].validate_python(_read_json(f"{name}.json")) for name in DASHBOARD}
dashboard_json = {name: dashboard_adapters[name].dump_json(data, by_alias=True) for name, data in dashboard_data.items()}

meta_json = meta.model_dump_json()
options_json = form_options.model_dump_json()

# All scored December complaints. actual_relief is dropped: a reviewer working the queue
# can't know the outcome yet (it exists only because this is historical data).
complaints = pd.read_parquet(ART / "test_scored.parquet").drop(columns=["actual_relief"])
complaints["reasons"] = complaints["reasons"].map(lambda rs: [dict(r) for r in rs])
complaints["top_words"] = complaints["top_words"].map(list)
complaints = complaints.sort_values("score", ascending=False, kind="stable").reset_index(drop=True)

# Precomputed once for filtering and search
received = pd.to_datetime(complaints["Date received"]).dt.date
search_narrative = complaints["narrative_preview"].str.lower()
search_company = complaints["Company"].str.lower()
search_id = complaints["Complaint ID"].astype(str)


def _check_contract():
    """Stop at startup if the artifacts and this code disagree on the input columns or tiers."""
    required = meta.required_input_columns
    if schemas.ComplaintInput.column_names() != required:
        raise RuntimeError(f"ComplaintInput fields {schemas.ComplaintInput.column_names()} "
                           f"!= model_meta.required_input_columns {required}")
    if list(core.REQUIRED_INPUT) != required:
        raise RuntimeError(f"cinsight_core.REQUIRED_INPUT {core.REQUIRED_INPUT} != model_meta {required}")
    if ACTION != core.TIER_ACTION:
        raise RuntimeError(f"model_meta tiers {ACTION} != cinsight_core.TIER_ACTION {core.TIER_ACTION}")


_check_contract()
