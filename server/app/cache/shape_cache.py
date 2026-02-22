# ─────────────────────────────────────────────────────────────────────────────
# Shape Cache — async two-tier caching (memory LRU + Cloud Storage)
# ─────────────────────────────────────────────────────────────────────────────
# Uses cachetools.LRUCache for proper LRU semantics.
# Cloud Storage calls are synchronous (google-cloud-storage SDK), so all
# storage I/O is wrapped in run_in_executor to avoid blocking the event loop.
# ─────────────────────────────────────────────────────────────────────────────


import asyncio
import hashlib
import logging
import re

from cachetools import LRUCache

from app.schemas import GenerateResponse

logger = logging.getLogger(__name__)

# ── Stop words stripped during key normalization ─────────────────────────────
_ARTICLES = frozenset({"a", "an", "the"})


class ShapeCache:
    """Two-tier cache: in-memory LRU (cachetools) + Cloud Storage.

    Tier 1: In-memory LRU via cachetools.LRUCache.
    Tier 2: Cloud Storage bucket for persistence across container restarts.

    All Cloud Storage I/O runs in a thread executor.
    """

    def __init__(self, bucket_name: str = "", memory_capacity: int = 100):
        self._bucket_name = bucket_name
        self._memory: LRUCache = LRUCache(maxsize=memory_capacity)
        self._client = None
        self._bucket = None
        self._memory_hits = 0
        self._storage_hits = 0
        self._misses = 0

    async def connect(self) -> None:
        """Initialize Cloud Storage client. Async wrapper around sync SDK."""
        if self._bucket_name:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._connect_sync)
        else:
            logger.info("No CACHE_BUCKET set — running with memory-only cache")

    def _connect_sync(self) -> None:
        """Synchronous Cloud Storage connection."""
        try:
            from google.cloud import storage

            self._client = storage.Client()
            self._bucket = self._client.bucket(self._bucket_name)
            logger.info(f"Cache connected to gs://{self._bucket_name}")
        except Exception as e:
            logger.warning(f"Cloud Storage unavailable ({e}). Memory-only cache active.")

    async def disconnect(self) -> None:
        """Close Cloud Storage client."""
        if self._client:
            self._client.close()

    @property
    def is_connected(self) -> bool:
        """Whether the cache backend is operational (memory always counts)."""
        return self._bucket is not None or not self._bucket_name

    # ── Key normalization ────────────────────────────────────────────────────

    @staticmethod
    def normalize_key(text: str) -> str:
        """Normalize input text to a canonical form.

        Strips punctuation, lowercases, removes articles.
        """
        text = text.lower().strip()
        text = re.sub(r"[^\w\s]", "", text)
        words = [w for w in text.split() if w not in _ARTICLES]
        return " ".join(words) if words else text

    @staticmethod
    def _hash_key(normalized: str) -> str:
        """SHA-256 hash of normalized text, first 16 hex chars."""
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    # ── Get ──────────────────────────────────────────────────────────────────

    async def get(self, text: str) -> GenerateResponse | None:
        """Look up a cached shape. Checks memory first, then Cloud Storage."""
        normalized = self.normalize_key(text)
        key = self._hash_key(normalized)

        # Tier 1: Memory
        if key in self._memory:
            self._memory_hits += 1
            logger.debug(f"Cache HIT (memory): '{text}' → {key}")
            return self._memory[key]

        # Tier 2: Cloud Storage
        if self._bucket:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self._get_from_storage, key)
            if result is not None:
                self._storage_hits += 1
                self._memory[key] = result  # Promote to memory
                logger.debug(f"Cache HIT (storage): '{text}' → {key}")
                return result

        self._misses += 1
        logger.debug(f"Cache MISS: '{text}' → {key}")
        return None

    def _get_from_storage(self, key: str) -> GenerateResponse | None:
        """Synchronous Cloud Storage read. Runs in executor."""
        try:
            blob = self._bucket.blob(f"shapes/{key}.json")
            if blob.exists():
                return GenerateResponse.model_validate_json(blob.download_as_text())
        except Exception as e:
            logger.warning(f"Cache read failed for {key}: {e}")
        return None

    # ── Set ──────────────────────────────────────────────────────────────────

    async def set(self, text: str, response: GenerateResponse) -> None:
        """Cache a shape in both memory and Cloud Storage."""
        normalized = self.normalize_key(text)
        key = self._hash_key(normalized)

        # Tier 1: Memory
        self._memory[key] = response

        # Tier 2: Cloud Storage (fire and forget in executor)
        if self._bucket:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._set_in_storage, key, response)

    def _set_in_storage(self, key: str, response: GenerateResponse) -> None:
        """Synchronous Cloud Storage write. Runs in executor."""
        try:
            blob = self._bucket.blob(f"shapes/{key}.json")
            blob.upload_from_string(
                response.model_dump_json(),
                content_type="application/json",
            )
        except Exception as e:
            logger.warning(f"Cache write failed for {key}: {e}")

    # ── Stats ────────────────────────────────────────────────────────────────

    async def stats(self) -> dict:
        """Return cache hit/miss statistics."""
        total = self._memory_hits + self._storage_hits + self._misses
        return {
            "memory_cache_size": len(self._memory),
            "memory_hits": self._memory_hits,
            "storage_hits": self._storage_hits,
            "misses": self._misses,
            "hit_rate": round((self._memory_hits + self._storage_hits) / max(total, 1), 3),
        }

    # ── Management ───────────────────────────────────────────────────────────

    def clear_memory(self) -> None:
        """Clear the in-memory cache. Does not affect Cloud Storage."""
        self._memory.clear()
        logger.info("In-memory cache cleared")
