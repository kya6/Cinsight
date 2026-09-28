# Cinsight API image. CranL builds this from the repository root.
# Python major.minor must match artifacts/model_meta.json -> versions.python (3.13.x),
# and backend/requirements.txt pins the model libraries to the notebook's versions.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# The model and every file the API serves live in artifacts/ and must be inside the image
COPY artifacts/ artifacts/
COPY backend/app/ backend/app/

RUN useradd --create-home cinsight
USER cinsight

WORKDIR /app/backend
ENV ARTIFACTS_DIR=/app/artifacts

# Bind to 0.0.0.0: binding to localhost would make the app unreachable on CranL
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
