from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
from scipy.ndimage import maximum_filter

from sonodyssey.core.config import Settings


@dataclass(slots=True)
class ExtractedTrack:
    track_id: str
    title: str
    file_name: str
    absolute_path: Path
    duration_seconds: float
    sample_rate: int
    embedding: np.ndarray
    peaks_preview: list[list[float]]
    metrics: dict[str, float]


class AudioFeatureExtractor:
    """Extract compact MIR features from WAV files."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def extract_from_file(self, path: Path) -> ExtractedTrack:
        y, sr = librosa.load(
            path,
            sr=self.settings.sample_rate,
            mono=True,
            duration=self.settings.duration_seconds,
        )
        if y.size == 0:
            raise ValueError(f"Audio file '{path.name}' produced an empty waveform.")

        duration_seconds = float(librosa.get_duration(y=y, sr=sr))
        y = librosa.util.normalize(y)

        mel = librosa.feature.melspectrogram(
            y=y,
            sr=sr,
            n_fft=self.settings.n_fft,
            hop_length=self.settings.hop_length,
            n_mels=self.settings.n_mels,
            power=2.0,
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        chroma = librosa.feature.chroma_stft(
            y=y,
            sr=sr,
            n_fft=self.settings.n_fft,
            hop_length=self.settings.hop_length,
            n_chroma=self.settings.n_chroma,
        )
        mfcc = librosa.feature.mfcc(
            y=y,
            sr=sr,
            n_mfcc=self.settings.n_mfcc,
            n_fft=self.settings.n_fft,
            hop_length=self.settings.hop_length,
        )
        spectral_centroid = librosa.feature.spectral_centroid(
            y=y,
            sr=sr,
            n_fft=self.settings.n_fft,
            hop_length=self.settings.hop_length,
        )
        spectral_bandwidth = librosa.feature.spectral_bandwidth(
            y=y,
            sr=sr,
            n_fft=self.settings.n_fft,
            hop_length=self.settings.hop_length,
        )
        zero_crossing_rate = librosa.feature.zero_crossing_rate(y, hop_length=self.settings.hop_length)
        tempo = float(librosa.feature.tempo(y=y, sr=sr, hop_length=self.settings.hop_length)[0])
        rms = librosa.feature.rms(y=y, frame_length=self.settings.n_fft, hop_length=self.settings.hop_length)

        peaks_preview = self._constellation_preview(mel_db, sr)

        embedding = np.concatenate(
            [
                chroma.mean(axis=1),
                chroma.std(axis=1),
                mfcc.mean(axis=1),
                mfcc.std(axis=1),
                np.array(
                    [
                        float(np.mean(spectral_centroid)),
                        float(np.std(spectral_centroid)),
                        float(np.mean(spectral_bandwidth)),
                        float(np.std(spectral_bandwidth)),
                        float(np.mean(zero_crossing_rate)),
                        float(np.std(zero_crossing_rate)),
                        float(np.mean(rms)),
                        float(np.std(rms)),
                        tempo,
                    ],
                    dtype=np.float32,
                ),
            ]
        ).astype(np.float32)

        metrics = {
            "tempo_bpm": tempo,
            "rms_mean": float(np.mean(rms)),
            "spectral_centroid_mean": float(np.mean(spectral_centroid)),
            "spectral_bandwidth_mean": float(np.mean(spectral_bandwidth)),
            "zero_crossing_rate_mean": float(np.mean(zero_crossing_rate)),
            "peak_count_preview": float(len(peaks_preview)),
        }

        track_id = hashlib.md5(str(path.resolve()).encode("utf-8")).hexdigest()[:12]
        print(f"Audio file procesed: {path}")
        return ExtractedTrack(
            track_id=track_id,
            title=path.stem.replace("_", " ").replace("-", " ").title(),
            file_name=path.name,
            absolute_path=path.resolve(),
            duration_seconds=duration_seconds,
            sample_rate=sr,
            embedding=embedding,
            peaks_preview=peaks_preview,
            metrics=metrics,
        )

    def _constellation_preview(self, mel_db: np.ndarray, sr: int) -> list[list[float]]:
        local_max = maximum_filter(mel_db, size=(6, 10))
        mask = (mel_db == local_max) & (mel_db > np.percentile(mel_db, 92))
        freq_bins, time_bins = np.where(mask)
        if freq_bins.size == 0:
            return []

        times = librosa.frames_to_time(time_bins, sr=sr, hop_length=self.settings.hop_length)
        freqs = librosa.mel_frequencies(n_mels=self.settings.n_mels)[freq_bins]

        points = np.column_stack([times, freqs])
        if len(points) > 250:
            step = max(1, len(points) // 250)
            points = points[::step]
        return [[float(t), float(f)] for t, f in points]
