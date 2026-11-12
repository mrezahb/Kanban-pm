import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


static_dir = Path(
    os.environ.get(
        "STATIC_DIR",
        Path(__file__).resolve().parents[2] / "frontend" / "out",
    )
)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
