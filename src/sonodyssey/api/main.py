from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from sonodyssey.api.dependencies import get_cached_settings, get_indexer
from sonodyssey.core.config import Settings
from sonodyssey.core.logging import configure_logging
from sonodyssey.core.schemas import (
    HealthResponse,
    ProjectionResponse,
    RebuildResponse,
    TrackDetail,
    TrackSummary,
)

configure_logging()

app = FastAPI(
    title="Audio Constellation Explorer API",
    version="0.1.0",
    description="Interactive WAV similarity explorer with constellation previews and projection maps.",
)

settings = get_cached_settings()
static_dir = Path(__file__).resolve().parents[1] / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(static_dir / "index.html")


@app.get("/api/health", response_model=HealthResponse)
def health(indexer=Depends(get_indexer)) -> HealthResponse:
    collection = indexer.load()
    return HealthResponse(status="ok", indexed_tracks=len(collection.tracks))


@app.get("/api/tracks", response_model=list[TrackSummary])
def list_tracks(indexer=Depends(get_indexer)) -> list[TrackSummary]:
    collection = indexer.load()
    return [TrackSummary(**_public_track_payload(track)) for track in collection.tracks]


@app.get("/api/tracks/{track_id}", response_model=TrackDetail)
def get_track(track_id: str, indexer=Depends(get_indexer)) -> TrackDetail:
    collection = indexer.load()
    for track in collection.tracks:
        if track["id"] == track_id:
            public_payload = _public_track_payload(track)
            return TrackDetail(
                **public_payload,
                metrics=track["metrics"],
                nearest_neighbors=track["nearest_neighbors"],
                peaks_preview=track["peaks_preview"],
            )
    raise HTTPException(status_code=404, detail="Track not found")


@app.get("/api/projection", response_model=ProjectionResponse)
def get_projection(indexer=Depends(get_indexer)) -> ProjectionResponse:
    collection = indexer.load()
    return ProjectionResponse(points=collection.projection)


@app.post("/api/rebuild", response_model=RebuildResponse)
def rebuild_index(
    indexer=Depends(get_indexer),
    current_settings: Settings = Depends(get_cached_settings),
) -> RebuildResponse:
    collection = indexer.build()
    return RebuildResponse(
        status="ok",
        indexed_tracks=len(collection.tracks),
        audio_directory=str(current_settings.audio_dir),
    )


@app.get("/api/audio/{file_name}")
def get_audio(
    file_name: str,
    current_settings: Settings = Depends(get_cached_settings),
) -> FileResponse:
    audio_path = (current_settings.audio_dir / file_name).resolve()
    if current_settings.audio_dir.resolve() not in audio_path.parents:
        raise HTTPException(status_code=400, detail="Invalid audio path")
    if not audio_path.exists() or audio_path.suffix.lower() != ".wav":
        raise HTTPException(status_code=404, detail="Audio file not found")
    media_type = mimetypes.guess_type(audio_path.name)[0] or "audio/wav"
    return FileResponse(audio_path, media_type=media_type, filename=audio_path.name)


def _public_track_payload(track: dict) -> dict:
    return {
        "id": track["id"],
        "title": track["title"],
        "file_name": track["file_name"],
        "duration_seconds": track["duration_seconds"],
        "sample_rate": track["sample_rate"],
        "projection": track["projection"],
    }
