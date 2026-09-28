"""Pydantic models for every request, response and exported artifact.

Fields that carry a CSV column name ("Complaint ID", "Sub-product", ...) use it as the JSON key,
so the API, the batch CSV, the parquet and model_meta.json all speak the same names.
The frontend generates its TypeScript types from these (npm run gen:types).
"""
from typing import Literal

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

Tier = Literal["High", "Medium", "Low"]
Direction = Literal["toward relief", "away from relief"]


class Reason(BaseModel):
    factor: str
    contribution: float = Field(description="Contribution to the log-odds of relief")
    direction: Direction


class TierCounts(BaseModel):
    High: int
    Medium: int
    Low: int


class TierShares(BaseModel):
    High: float
    Medium: float
    Low: float


# ---- model_meta.json

class Thresholds(BaseModel):
    high: float
    medium: float


class TierRule(BaseModel):
    tier: Tier
    rule: str
    action: str


class ModelMeta(BaseModel):
    model_name: str
    calibrated: bool
    score_label: str
    score_meaning: str
    trained_on: str
    threshold_tuned_on: str
    tested_on: str
    features: list[str]
    required_input_columns: list[str]
    thresholds: Thresholds
    tiers: list[TierRule]
    base_rate_train: float
    versions: dict[str, str]
    created_at: str


class Health(BaseModel):
    status: Literal["ok"]
    model_name: str
    calibrated: bool
    versions: dict[str, str]
    created_at: str


# ---- form_options.json

class CompanyOption(BaseModel):
    name: str
    complaints: int


class FormOptions(BaseModel):
    hierarchy: dict[str, dict[str, dict[str, list[str]]]] = Field(
        description="Product -> Sub-product -> Issue -> list of Sub-issues")
    companies: list[CompanyOption]
    states: list[str]
    tags: list[str]
    missing_label: str
    required_input_columns: list[str]


# ---- score_bands.json (feeds PredictResponse.similar)

class ScoreBand(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    score_from: float = Field(alias="from")
    score_to: float = Field(alias="to")
    complaints: int
    relief_rate: float


class ScoreBands(BaseModel):
    split: str
    min_reliable_count: int
    note: str
    bands: list[ScoreBand]


# ---- dashboard files

class Kpis(BaseModel):
    total_complaints: int
    labeled_complaints: int
    unlabeled_complaints: int
    relief_count: int
    relief_rate: float
    date_from: str
    date_to: str
    test_month: str
    test_complaints: int
    test_tier_counts: TierCounts
    test_tier_shares: TierShares
    pr_auc_test: float
    pr_auc_baseline: float


class Outcome(BaseModel):
    outcome: str
    count: int
    share: float
    relief: Literal[0, 1]


class MonthlyPoint(BaseModel):
    month: str
    complaints: int
    relief_rate: float
    split: str
    predicted_high_share: float | None


class BreakdownRow(BaseModel):
    label: str
    complaints: int
    relief_rate: float


class Breakdowns(BaseModel):
    overall_relief_rate: float
    product: list[BreakdownRow]
    issue: list[BreakdownRow]
    company: list[BreakdownRow]
    state: list[BreakdownRow]
    tags: list[BreakdownRow]
    day_of_week: list[BreakdownRow]


class ModelScore(BaseModel):
    model: str
    pr_auc: float
    f1_at_0_5: float
    precision_at_0_5: float
    recall_at_0_5: float


class ModelComparison(BaseModel):
    split: str
    metric_note: str
    positive_rate: float
    models: list[ModelScore]


class Confusion(BaseModel):
    tn: int
    fp: int
    fn: int
    tp: int


class ValidationMetrics(BaseModel):
    pr_auc: float
    precision: float
    recall: float
    f1: float


class TestMetrics(BaseModel):
    split: str
    n: int
    positive_rate: float
    threshold: float
    pr_auc: float
    baseline_pr_auc: float
    precision: float
    recall: float
    f1: float
    accuracy: float
    confusion: Confusion
    tier_counts: TierCounts
    validation: ValidationMetrics


class PrPoint(BaseModel):
    threshold: float
    precision: float
    recall: float


class PrCurve(BaseModel):
    high_threshold: float
    validation: list[PrPoint]
    test: list[PrPoint]


class CalibrationPoint(BaseModel):
    predicted: float
    observed: float


class Calibration(BaseModel):
    split: str
    calibrated: bool
    note: str
    points: list[CalibrationPoint]


class ShapGroup(BaseModel):
    group: str
    mean_abs_shap: float
    share: float


class ShapFeature(BaseModel):
    feature: str
    group: str
    mean_abs_shap: float
    direction: Direction


class ShapImportance(BaseModel):
    method: str
    by_group: list[ShapGroup]
    top_features: list[ShapFeature]


class ScoredComplaint(BaseModel):
    """One scored December complaint (high_risk_top.json and test_scored.parquet rows)."""
    model_config = ConfigDict(populate_by_name=True)
    complaint_id: int = Field(alias="Complaint ID")
    date_received: str = Field(alias="Date received")
    product: str = Field(alias="Product")
    sub_product: str = Field(alias="Sub-product")
    issue: str = Field(alias="Issue")
    sub_issue: str = Field(alias="Sub-issue")
    company: str = Field(alias="Company")
    state: str = Field(alias="State")
    tags: str = Field(alias="Tags")
    score: float
    tier: Tier
    action: str
    narrative_preview: str = Field(description="First 280 characters of the narrative")
    reasons: list[Reason]
    top_words: list[str]
    top_reason: str | None


# ---- /api/predict

class ComplaintInput(BaseModel):
    """One complaint, keyed by the columns in model_meta.json -> required_input_columns.

    Every key must be present; a value may be null or empty (it is then treated as missing).
    """
    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={"examples": [{
            "Date received": "2025-12-15",
            "Consumer complaint narrative": "I was charged twice for the same purchase and the bank refused a refund.",
            "Product": "Credit card",
            "Sub-product": "General-purpose credit card or charge card",
            "Issue": "Problem with a purchase shown on your statement",
            "Sub-issue": "Not provided",
            "Company": "CITIBANK, N.A.",
            "State": "NY",
            "Tags": "Not provided",
        }]},
    )
    date_received: str | None = Field(alias="Date received", description="YYYY-MM-DD")
    narrative: str | None = Field(alias="Consumer complaint narrative", max_length=100_000)
    product: str | None = Field(alias="Product")
    sub_product: str | None = Field(alias="Sub-product")
    issue: str | None = Field(alias="Issue")
    sub_issue: str | None = Field(alias="Sub-issue")
    company: str | None = Field(alias="Company")
    state: str | None = Field(alias="State")
    tags: str | None = Field(alias="Tags")

    @classmethod
    def column_names(cls) -> list[str]:
        return [f.alias for f in cls.model_fields.values()]

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame([self.model_dump(by_alias=True)])


class SimilarComplaints(BaseModel):
    """Observed relief rate among complaints that scored in the same band (score_bands.json)."""
    score_from: float
    score_to: float
    complaints: int
    relief_rate: float
    split: str


class PredictResponse(BaseModel):
    score: float
    tier: Tier
    action: str
    reasons: list[Reason]
    top_words: list[str]
    similar: SimilarComplaints | None = Field(
        description="Null when the band has too few complaints to be reliable")


# ---- /api/predict/batch

class BatchRow(BaseModel):
    row: int = Field(description="1-based data row number in the uploaded file")
    values: dict[str, str] = Field(description="Every original column of the row, as uploaded")
    score: float
    tier: Tier
    action: str
    reasons: list[Reason]
    top_words: list[str]


class BatchResponse(BaseModel):
    columns: list[str] = Field(description="Original column order of the uploaded file")
    rows: list[BatchRow]
    summary: TierCounts
    scored: int
    rejected: int
    rejected_rows: list[int] = Field(description="Row numbers skipped because every required column was blank")


class ErrorDetail(BaseModel):
    message: str
    missing_columns: list[str] = []


class ErrorResponse(BaseModel):
    detail: ErrorDetail


# ---- /api/complaints

class ComplaintPage(BaseModel):
    items: list[ScoredComplaint]
    total: int = Field(description="Rows matching every filter")
    page: int
    page_size: int
    tier_counts: TierCounts = Field(description="Rows per tier matching every filter except tier")
