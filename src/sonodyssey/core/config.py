from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Filesystem and audio processing settings."""

    project_root: Path
    data_dir: Path
    audio_dir: Path
    outputs_dir: Path
    index_path: Path
    projection_path: Path
    sample_rate: int = 22050
    duration_seconds: float = 30.0
    n_fft: int = 4096
    hop_length: int = 512
    n_mels: int = 128
    n_mfcc: int = 20
    n_chroma: int = 12
    projection_dimensions: int = 2
    neighbor_count: int = 8

    @classmethod
    def from_project_root(cls, project_root: Path) -> "Settings":
        data_dir = project_root / "data"
        audio_dir = data_dir / "wav"
        outputs_dir = project_root / "outputs"
        return cls(
            project_root=project_root,
            data_dir=data_dir,
            audio_dir=audio_dir,
            outputs_dir=outputs_dir,
            index_path=outputs_dir / "index.json",
            projection_path=outputs_dir / "projection.json",
        )


def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[3]
    settings = Settings.from_project_root(project_root)
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    settings.outputs_dir.mkdir(parents=True, exist_ok=True)
    return settings
