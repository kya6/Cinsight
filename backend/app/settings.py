"""Runtime settings, read from environment variables (see backend/.env.example)."""
import os
from pathlib import Path

# The notebook's exported files. Default: the repo's artifacts/ folder (also where the Dockerfile puts it).
ARTIFACTS_DIR = Path(os.getenv("ARTIFACTS_DIR", Path(__file__).resolve().parents[2] / "artifacts"))

# Browser origins allowed besides http://localhost:3000 and https://*.vercel.app previews, comma-separated
FRONTEND_ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()]

MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "10"))        # batch CSV size limit
MAX_BATCH_ROWS = int(os.getenv("MAX_BATCH_ROWS", "20000"))     # batch CSV row limit
EXPORT_MAX_ROWS = int(os.getenv("EXPORT_MAX_ROWS", "20000"))   # queue CSV export cap
