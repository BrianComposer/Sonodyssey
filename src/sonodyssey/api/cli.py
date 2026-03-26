from __future__ import annotations

import argparse

import uvicorn

from sonodyssey.api.dependencies import get_cached_settings, get_indexer


def build_index_command() -> None:
    indexer = get_indexer()
    collection = indexer.build()
    print(f"Indexed {len(collection.tracks)} tracks from {get_cached_settings().audio_dir}")


def serve_command() -> None:
    parser = argparse.ArgumentParser(description="Serve Audio Constellation Explorer with Uvicorn.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    uvicorn.run(
        "sonodyssey.api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
