from __future__ import annotations

from functools import lru_cache

from sonodyssey.core.config import Settings, get_settings
from sonodyssey.core.indexer import AudioIndexer


@lru_cache(maxsize=1)
def get_cached_settings() -> Settings:
    return get_settings()


@lru_cache(maxsize=1)
def get_indexer() -> AudioIndexer:
    return AudioIndexer(get_cached_settings())
