from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.decomposition import PCA
from sklearn.metrics.pairwise import euclidean_distances
from sklearn.preprocessing import StandardScaler

from sonodyssey.core.audio_features import AudioFeatureExtractor, ExtractedTrack
from sonodyssey.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class IndexedCollection:
    tracks: list[dict[str, Any]]
    projection: list[dict[str, Any]]


class AudioIndexer:
    """Build a reusable similarity index from a WAV directory."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.extractor = AudioFeatureExtractor(settings)

    def build(self) -> IndexedCollection:
        wav_paths = sorted(self.settings.audio_dir.glob("*.wav"))
        if not wav_paths:
            raise FileNotFoundError(
                f"No WAV files were found in '{self.settings.audio_dir}'. Add files and rebuild the index."
            )

        extracted_tracks = []
        failed_files = []

        for path in wav_paths:
            try:
                track = self.extractor.extract_from_file(path)
                extracted_tracks.append(track)
            except Exception as e:
                logger.error("Error processing '%s': %s", path, str(e), exc_info=True)
                print(f"[ERROR] Failed to process {path.name}: {e}")
                failed_files.append(path)

        if not extracted_tracks:
            raise RuntimeError(
                "All audio files failed during feature extraction. Cannot build index."
            )

        embeddings = np.vstack([track.embedding for track in extracted_tracks])
        scaled = StandardScaler().fit_transform(embeddings)

        projection = self._project_embeddings(scaled)
        distances = euclidean_distances(scaled)

        tracks_payload = self._build_tracks_payload(extracted_tracks, projection, distances)
        projection_payload = self._build_projection_payload(extracted_tracks, projection)

        self.settings.outputs_dir.mkdir(parents=True, exist_ok=True)
        self.settings.index_path.write_text(
            json.dumps({"tracks": tracks_payload}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self.settings.projection_path.write_text(
            json.dumps({"points": projection_payload}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        logger.info(
            "Indexed %s tracks (%s failed) into %s",
            len(extracted_tracks),
            len(failed_files),
            self.settings.outputs_dir,
        )

        if failed_files:
            print("\n[WARNING] Some files failed during processing:")
            for f in failed_files:
                print(f" - {f.name}")

        return IndexedCollection(tracks=tracks_payload, projection=projection_payload)
    # def build(self) -> IndexedCollection:
    #     wav_paths = sorted(self.settings.audio_dir.glob("*.wav"))
    #     if not wav_paths:
    #         raise FileNotFoundError(
    #             f"No WAV files were found in '{self.settings.audio_dir}'. Add files and rebuild the index."
    #         )
    #
    #     extracted_tracks = [self.extractor.extract_from_file(path) for path in wav_paths]
    #     embeddings = np.vstack([track.embedding for track in extracted_tracks])
    #     scaled = StandardScaler().fit_transform(embeddings)
    #
    #     projection = self._project_embeddings(scaled)
    #     distances = euclidean_distances(scaled)
    #
    #     tracks_payload = self._build_tracks_payload(extracted_tracks, projection, distances)
    #     projection_payload = self._build_projection_payload(extracted_tracks, projection)
    #
    #     self.settings.outputs_dir.mkdir(parents=True, exist_ok=True)
    #     self.settings.index_path.write_text(
    #         json.dumps({"tracks": tracks_payload}, indent=2, ensure_ascii=False),
    #         encoding="utf-8",
    #     )
    #     self.settings.projection_path.write_text(
    #         json.dumps({"points": projection_payload}, indent=2, ensure_ascii=False),
    #         encoding="utf-8",
    #     )
    #     logger.info("Indexed %s tracks into %s", len(extracted_tracks), self.settings.outputs_dir)
    #     return IndexedCollection(tracks=tracks_payload, projection=projection_payload)

    def load(self) -> IndexedCollection:
        if not self.settings.index_path.exists() or not self.settings.projection_path.exists():
            return self.build()

        tracks = json.loads(self.settings.index_path.read_text(encoding="utf-8"))["tracks"]
        projection = json.loads(self.settings.projection_path.read_text(encoding="utf-8"))["points"]
        return IndexedCollection(tracks=tracks, projection=projection)

    def _project_embeddings(self, scaled_embeddings: np.ndarray) -> np.ndarray:
        if len(scaled_embeddings) == 1:
            return np.array([[0.0, 0.0]], dtype=np.float32)
        pca = PCA(n_components=2, random_state=42)
        projected = pca.fit_transform(scaled_embeddings)
        return projected.astype(np.float32)

    def _build_tracks_payload(
        self,
        extracted_tracks: list[ExtractedTrack],
        projection: np.ndarray,
        distances: np.ndarray,
    ) -> list[dict[str, Any]]:
        payload: list[dict[str, Any]] = []
        for idx, track in enumerate(extracted_tracks):
            neighbor_indices = np.argsort(distances[idx])[1 : self.settings.neighbor_count + 1]
            neighbors = [
                {
                    "id": extracted_tracks[j].track_id,
                    "title": extracted_tracks[j].title,
                    "file_name": extracted_tracks[j].file_name,
                    "distance": float(distances[idx, j]),
                }
                for j in neighbor_indices
            ]
            payload.append(
                {
                    "id": track.track_id,
                    "title": track.title,
                    "file_name": track.file_name,
                    "absolute_path": str(track.absolute_path),
                    "duration_seconds": track.duration_seconds,
                    "sample_rate": track.sample_rate,
                    "projection": [float(projection[idx, 0]), float(projection[idx, 1])],
                    "metrics": track.metrics,
                    "nearest_neighbors": neighbors,
                    "peaks_preview": track.peaks_preview,
                }
            )
        return payload

    def _build_projection_payload(
        self,
        extracted_tracks: list[ExtractedTrack],
        projection: np.ndarray,
    ) -> list[dict[str, Any]]:
        return [
            {
                "id": track.track_id,
                "title": track.title,
                "file_name": track.file_name,
                "x": float(projection[idx, 0]),
                "y": float(projection[idx, 1]),
                "duration_seconds": track.duration_seconds,
            }
            for idx, track in enumerate(extracted_tracks)
        ]
