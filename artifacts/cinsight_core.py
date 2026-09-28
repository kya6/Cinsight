"""Cinsight shared logic — used by the Colab notebook AND the web backend.

v1 — matches the section 6 model of the master notebook:
  * features: TF-IDF narrative + one-hot categories (incl. Received Month) + raw Narrative Length
  * missing categories are kept as NaN (the encoder learned them as their own category)
When section 6 is improved, update FEATURES / prepare_features here and re-run section 9.
"""
import re
import numpy as np
import pandas as pd
from scipy import sparse

REDACTED = re.compile(r"^x+$")          # CFPB redaction tokens (XXXX, XX/XX)
TEXT = "Consumer complaint narrative"
DATE = "Date received"
RAW_CATEGORICAL = ["Product", "Sub-product", "Issue", "Sub-issue", "Company", "State", "Tags"]
CATEGORICAL = RAW_CATEGORICAL + ["Received Month", "Received Day of Week"]
NUMERIC = ["Narrative Length"]
FEATURES = [TEXT] + CATEGORICAL + NUMERIC

# Columns a batch CSV (or the single-complaint form) must provide
REQUIRED_INPUT = [DATE, TEXT] + RAW_CATEGORICAL

MISSING = "Not provided"                                  # label shown in the UI
MISSING_INPUTS = {"", "not provided", "nan", "none", "null"}   # treated as missing when received

RELIEF_MAP = {
    "Closed with monetary relief": 1,
    "Closed with non-monetary relief": 1,
    "Closed with explanation": 0,
    "Closed": 0,
}

TIER_ACTION = {"High": "Early review", "Medium": "Monitor", "Low": "Standard queue"}


def prepare_features(df):
    """Raw complaint rows -> model-ready frame. Same code in the notebook and on the website."""
    out = pd.DataFrame(index=df.index)
    text = df[TEXT] if TEXT in df.columns else pd.Series("", index=df.index)
    out[TEXT] = text.fillna("").astype(str)

    for col in RAW_CATEGORICAL:
        vals = df[col] if col in df.columns else pd.Series(np.nan, index=df.index)
        vals = vals.astype(object)
        missing = vals.isna() | vals.astype(str).str.strip().str.lower().isin(MISSING_INPUTS)
        out[col] = vals.where(~missing, np.nan)

    if DATE in df.columns:
        dates = pd.to_datetime(df[DATE], errors="coerce", utc=True)
    else:
        dates = pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns, UTC]")
    out["Received Month"] = dates.dt.month
    out["Received Day of Week"] = dates.dt.day_name()
    out["Narrative Length"] = out[TEXT].str.len()
    return out[FEATURES]


def assign_tier(score, high_threshold, medium_threshold):
    s = np.asarray(score, dtype=float)
    return np.where(s >= high_threshold, "High", np.where(s >= medium_threshold, "Medium", "Low"))


def feature_group(name):
    """'cat__Company_BANK X' -> ('Company', 'BANK X'); 'text__refund' -> ('Narrative', 'refund')."""
    block, _, rest = name.partition("__")
    if block == "text":
        return "Narrative", rest
    if block == "num":
        return rest, None
    for col in sorted(CATEGORICAL, key=len, reverse=True):
        if rest.startswith(col + "_"):
            value = rest[len(col) + 1:]
            return col, (MISSING if value == "nan" else value)
    return rest, None


def explain(base_pipeline, X_features, top_k=5, top_words=5):
    """Per-complaint explanation for the linear model.

    Contribution of each feature to the log-odds = coefficient x feature value.
    Narrative words are grouped into one 'Narrative wording' factor; the strongest words are listed.
    """
    prep = base_pipeline.named_steps["prep"]
    clf = base_pipeline.named_steps["clf"]
    groups = [feature_group(n) for n in prep.get_feature_names_out()]
    Xt = prep.transform(X_features)
    Xt = Xt.tocsr() if sparse.issparse(Xt) else sparse.csr_matrix(Xt)
    coef = clf.coef_.ravel()

    results = []
    for i in range(Xt.shape[0]):
        row = Xt.getrow(i)
        factors, words = {}, []
        for j, c in zip(row.indices, row.data * coef[row.indices]):
            group, value = groups[j]
            if group == "Narrative":
                factors["Narrative wording"] = factors.get("Narrative wording", 0.0) + c
                words.append((value, c))
            else:
                label = f"{group}: {value}" if value is not None else group
                factors[label] = factors.get(label, 0.0) + c
        ranked = sorted(factors.items(), key=lambda kv: abs(kv[1]), reverse=True)[:top_k]
        words_up = [w for w, c in sorted(words, key=lambda kv: kv[1], reverse=True)
                    if c > 0 and not REDACTED.match(w)][:top_words]
        results.append({
            "factors": [
                {"factor": k, "contribution": round(float(v), 4),
                 "direction": "toward relief" if v > 0 else "away from relief"}
                for k, v in ranked
            ],
            "top_words": words_up,
        })
    return results
