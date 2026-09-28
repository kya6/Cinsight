"""API tests. The parity tests are the important ones: the website must score exactly like the notebook."""
import csv
import io
import json
import re

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import settings, store
from app.main import app

client = TestClient(app)
ART = settings.ARTIFACTS_DIR
SAMPLE = (ART / "sample_batch.csv").read_bytes()
NOTEBOOK = pd.read_parquet(ART / "test_scored.parquet").set_index("Complaint ID")
KPIS = store.dashboard_data["kpis"]


def sample_rows():
    return pd.read_csv(io.BytesIO(SAMPLE), dtype=str)


def as_payload(row):
    return {c: (None if pd.isna(row[c]) else row[c]) for c in store.meta.required_input_columns}


def post_csv(data: bytes):
    return client.post("/api/predict/batch", content=data, headers={"Content-Type": "text/csv"})


def test_backend_pins_match_the_notebook():
    pins = lambda text: dict(re.findall(r"^([\w\-\[\]]+)==(\S+)", text, re.M))
    model = pins((ART / "requirements_model.txt").read_text())
    backend = pins((settings.ARTIFACTS_DIR.parent / "backend" / "requirements.txt").read_text())
    assert model and all(backend.get(lib) == version for lib, version in model.items()), (model, backend)


def test_health():
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["model_name"] == store.meta.model_name
    assert body["versions"]["scikit-learn"] == "1.6.1"


def test_meta_serves_model_meta():
    assert client.get("/api/meta").json() == json.loads((ART / "model_meta.json").read_text(encoding="utf-8"))


def test_options_serves_form_options():
    assert client.get("/api/options").json() == json.loads((ART / "form_options.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", list(store.DASHBOARD))
def test_dashboard_files(name):
    res = client.get(f"/api/dashboard/{name}")
    assert res.status_code == 200
    assert res.json() == json.loads((ART / f"{name}.json").read_text(encoding="utf-8"))


def test_dashboard_rejects_other_names():
    for name in ["model_meta", "score_bands", "manifest", "..%2Fsecrets"]:
        assert client.get(f"/api/dashboard/{name}").status_code == 404


def test_dashboard_limit():
    assert len(client.get("/api/dashboard/high_risk_top?limit=5").json()) == 5
    assert client.get("/api/dashboard/kpis?limit=5").json()["total_complaints"] > 0


def test_predict_matches_notebook():
    for _, row in sample_rows().iterrows():
        body = client.post("/api/predict", json=as_payload(row)).json()
        expected = NOTEBOOK.loc[int(row["Complaint ID"])]
        assert body["score"] == expected["score"]
        assert body["tier"] == expected["tier"]
        assert body["action"] == expected["action"]
        assert body["reasons"][:3] == [dict(r) for r in expected["reasons"]]
        assert body["top_words"] == list(expected["top_words"])
        assert len(body["reasons"]) <= 5


def test_predict_similar_band():
    body = client.post("/api/predict", json=as_payload(sample_rows().iloc[0])).json()
    band = body["similar"]
    assert band["score_from"] <= body["score"] < band["score_to"]
    assert band["split"] == store.score_bands.split


def test_predict_requires_every_column_but_allows_blanks():
    payload = as_payload(sample_rows().iloc[0])
    missing = {k: v for k, v in payload.items() if k != "Company"}
    assert client.post("/api/predict", json=missing).status_code == 422
    blanks = {k: None for k in payload}
    body = client.post("/api/predict", json=blanks).json()
    assert body["tier"] in {"High", "Medium", "Low"}


def test_batch_matches_notebook_and_keeps_columns():
    body = post_csv(SAMPLE).json()
    rows = sample_rows()
    assert body["scored"] == len(rows) and body["rejected"] == 0
    assert body["columns"] == list(rows.columns)
    assert sum(body["summary"].values()) == len(rows)
    for scored, (_, row) in zip(body["rows"], rows.iterrows()):
        expected = NOTEBOOK.loc[int(row["Complaint ID"])]
        assert scored["values"]["Complaint ID"] == row["Complaint ID"]
        assert scored["score"] == expected["score"]
        assert scored["reasons"] == [dict(r) for r in expected["reasons"]]


def test_batch_names_missing_columns():
    res = post_csv(b"Product,Company\nCredit card,CITIBANK\n")
    assert res.status_code == 400
    assert res.json()["detail"]["missing_columns"] == [
        "Date received", "Consumer complaint narrative", "Sub-product", "Issue", "Sub-issue", "State", "Tags"]


def test_batch_skips_blank_rows():
    header = ",".join(f'"{c}"' for c in store.meta.required_input_columns)
    blank = "," * (len(store.meta.required_input_columns) - 1)
    data = f"{header}\n2025-12-01,,Credit card,,,,CITIBANK,NY,\n{blank}\n".encode()
    body = post_csv(data).json()
    assert (body["scored"], body["rejected"], body["rejected_rows"]) == (1, 1, [2])


def test_batch_rejects_bad_files(monkeypatch):
    assert post_csv(b"").status_code == 400
    assert post_csv("Product\n".encode("utf-16")).status_code == 400
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 0.001)
    assert post_csv(SAMPLE).status_code == 413


def test_complaints_paginates_and_filters():
    body = client.get("/api/complaints?tier=High&page=2&page_size=10").json()
    assert body["total"] == KPIS.test_tier_counts.High
    assert len(body["items"]) == 10
    scores = [i["score"] for i in body["items"]]
    assert scores == sorted(scores, reverse=True)
    assert "actual_relief" not in body["items"][0]
    assert body["tier_counts"] == KPIS.test_tier_counts.model_dump()

    company = body["items"][0]["Company"]
    filtered = client.get("/api/complaints", params={"company": company, "date_from": "2025-12-10",
                                                     "date_to": "2025-12-20", "page_size": 100}).json()
    assert all(i["Company"] == company and "2025-12-10" <= i["Date received"] <= "2025-12-20"
               for i in filtered["items"])

    by_id = client.get("/api/complaints", params={"q": str(body["items"][0]["Complaint ID"])}).json()
    assert by_id["items"][0]["Complaint ID"] == body["items"][0]["Complaint ID"]


def test_complaints_never_returns_whole_table():
    assert client.get("/api/complaints?page_size=101").status_code == 422
    assert client.get("/api/complaints?tier=Urgent").status_code == 422


def test_export_streams_without_actual_relief(monkeypatch):
    monkeypatch.setattr(settings, "EXPORT_MAX_ROWS", 25)
    res = client.get("/api/complaints/export?tier=High")
    assert res.status_code == 200
    assert res.headers["x-total-rows"] == str(KPIS.test_tier_counts.High) and res.headers["x-exported-rows"] == "25"
    assert 'filename="cinsight-queue-high.csv"' in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert len(rows) == 25
    assert "actual_relief" not in rows[0]
    assert rows[0]["reason_1"] == NOTEBOOK.loc[int(rows[0]["Complaint ID"])]["top_reason"]


def test_sample_batch_download():
    res = client.get("/api/sample-batch")
    assert res.status_code == 200 and res.content == SAMPLE
