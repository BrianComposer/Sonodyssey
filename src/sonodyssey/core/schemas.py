from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    indexed_tracks: int


class Neighbor(BaseModel):
    id: str
    title: str
    file_name: str
    distance: float = Field(..., ge=0.0)


class TrackSummary(BaseModel):
    id: str
    title: str
    file_name: str
    duration_seconds: float
    sample_rate: int
    projection: list[float]


class TrackDetail(TrackSummary):
    metrics: dict[str, float]
    nearest_neighbors: list[Neighbor]
    peaks_preview: list[list[float]]


class ProjectionPoint(BaseModel):
    id: str
    title: str
    file_name: str
    x: float
    y: float
    duration_seconds: float


class ProjectionResponse(BaseModel):
    points: list[ProjectionPoint]


class RebuildResponse(BaseModel):
    status: Literal["ok"]
    indexed_tracks: int
    audio_directory: str
