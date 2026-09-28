"""Cinsight API. Run from backend/:  uvicorn app.main:app --reload"""
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from . import complaint_queue, schemas, scoring, settings, store

app = FastAPI(
    title="Cinsight API",
    summary="Scores CFPB complaints for how likely they are to end in relief. Serves the notebook's exported artifacts.",
    version=store.meta.created_at,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", *settings.FRONTEND_ORIGINS],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition", "X-Total-Rows", "X-Exported-Rows"],
)

JSON = "application/json"
NOT_FOUND = {404: {"model": schemas.ErrorResponse}}


@app.exception_handler(scoring.BatchError)
async def batch_error(_request, exc: scoring.BatchError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail.model_dump()})


@app.get("/", include_in_schema=False)
def root():
    return {"name": "Cinsight API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health", response_model=schemas.Health)
def health():
    m = store.meta
    return schemas.Health(status="ok", model_name=m.model_name, calibrated=m.calibrated,
                          versions=m.versions, created_at=m.created_at)


@app.get("/api/meta", response_model=schemas.ModelMeta)
def meta():
    return Response(store.meta_json, media_type=JSON)


@app.get("/api/options", response_model=schemas.FormOptions)
def options():
    return Response(store.options_json, media_type=JSON)


@app.get(
    "/api/dashboard/{name}",
    response_model=(schemas.Kpis | list[schemas.Outcome] | list[schemas.MonthlyPoint] | schemas.Breakdowns
                    | schemas.ModelComparison | schemas.TestMetrics | schemas.PrCurve | schemas.Calibration
                    | schemas.ShapImportance | list[schemas.ScoredComplaint]),
    responses=NOT_FOUND,
    description="One dashboard file. `name` is one of: " + ", ".join(store.DASHBOARD) + ".",
)
def dashboard(name: str, limit: int | None = Query(None, ge=1, description="List files only: first N items")):
    if name not in store.DASHBOARD:
        raise HTTPException(404, detail={"message": f"Unknown dashboard file '{name}'."})
    data = store.dashboard_data[name]
    if limit is not None and isinstance(data, list):
        return Response(store.dashboard_adapters[name].dump_json(data[:limit], by_alias=True), media_type=JSON)
    return Response(store.dashboard_json[name], media_type=JSON)


@app.post("/api/predict", response_model=schemas.PredictResponse)
def predict(complaint: schemas.ComplaintInput):
    return scoring.predict_one(complaint)


@app.post(
    "/api/predict/batch",
    response_model=schemas.BatchResponse,
    responses={400: {"model": schemas.ErrorResponse}, 413: {"model": schemas.ErrorResponse}},
    openapi_extra={"requestBody": {"required": True, "content": {
        "text/csv": {"schema": {"type": "string", "format": "binary"}}}}},
    description="Send the CSV file itself as the request body (Content-Type: text/csv). "
                "It is read in memory and never written to disk.",
)
async def predict_batch(request: Request):
    limit = int(settings.MAX_UPLOAD_MB * 1024 * 1024)
    too_big = scoring.BatchError(413, f"The file is larger than {settings.MAX_UPLOAD_MB:g} MB.")
    if int(request.headers.get("content-length") or 0) > limit:
        raise too_big
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise too_big
    return await run_in_threadpool(scoring.predict_batch, bytes(body))


def queue_filters(
    tier: schemas.Tier | None = None,
    product: str | None = None,
    company: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(None, max_length=200, description="Complaint ID, company or words in the narrative"),
):
    rows, tier_counts = complaint_queue.filter_complaints(tier, product, company, date_from, date_to, q)
    return rows, tier_counts, tier


@app.get("/api/complaints", response_model=schemas.ComplaintPage)
def complaints(filtered=Depends(queue_filters), page: int = Query(1, ge=1),
               page_size: int = Query(10, ge=1, le=100)):
    rows, tier_counts, _ = filtered
    return schemas.ComplaintPage(items=complaint_queue.page(rows, page, page_size), total=len(rows),
                                 page=page, page_size=page_size, tier_counts=tier_counts)


@app.get(
    "/api/complaints/export",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {}}, "description": "Streamed CSV, same filters as /api/complaints"}},
)
def complaints_export(filtered=Depends(queue_filters)):
    rows, _, tier = filtered
    exported = rows.iloc[:settings.EXPORT_MAX_ROWS]
    filename = f"cinsight-queue-{(tier or 'all').lower()}.csv"
    return StreamingResponse(
        complaint_queue.export_csv(exported),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "X-Total-Rows": str(len(rows)), "X-Exported-Rows": str(len(exported))},
    )


@app.get("/api/sample-batch", response_class=FileResponse,
         responses={200: {"content": {"text/csv": {}}, "description": "sample_batch.csv"}})
def sample_batch():
    return FileResponse(store.ART / "sample_batch.csv", media_type="text/csv", filename="sample_batch.csv")
