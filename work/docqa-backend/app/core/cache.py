import hashlib
import json
import logging
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory fallback LRU cache with TTL if Redis is unreachable
_MEMORY_CACHE: dict[str, tuple[float, str]] = {}
_MEMORY_CACHE_MAX = 1000

_redis_client = None
_redis_available: bool | None = None


def get_redis_client():
    """Lazily initialize Redis client with automatic connection verification."""
    global _redis_client, _redis_available
    if _redis_available is False:
        return None

    if _redis_client is None:
        try:
            import redis

            client = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=1.0,
                socket_connect_timeout=1.0,
            )
            client.ping()
            _redis_client = client
            _redis_available = True
            logger.info("Connected to Redis cache successfully.")
        except Exception as e:
            logger.warning("Redis cache unavailable (%s). Using thread-safe in-memory cache.", e)
            _redis_available = False
            _redis_client = None

    return _redis_client


def make_search_cache_key(
    query: str,
    subject_id: str | None = None,
    min_year: int | None = None,
    max_year: int | None = None,
    exam_type: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> str:
    """Generate a deterministic MD5 hash key for search query and filter parameters."""
    raw = f"{query.strip().lower()}|{subject_id or ''}|{min_year or ''}|{max_year or ''}|{exam_type or ''}|{page}|{page_size}"
    h = hashlib.md5(raw.encode("utf-8")).hexdigest()
    return f"search:{h}"


def get_cached_search(key: str) -> dict[str, Any] | None:
    """Retrieve search result from Redis or in-memory fallback."""
    client = get_redis_client()
    if client:
        try:
            data = client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning("Redis get error: %s", e)

    # In-memory fallback
    now = time.time()
    if key in _MEMORY_CACHE:
        expires_at, val = _MEMORY_CACHE[key]
        if now < expires_at:
            return json.loads(val)
        else:
            _MEMORY_CACHE.pop(key, None)

    return None


def set_cached_search(key: str, data: dict[str, Any], ttl_seconds: int = 300) -> None:
    """Store search result with TTL (default: 5 minutes) in Redis or in-memory fallback."""
    serialized = json.dumps(data)
    client = get_redis_client()
    if client:
        try:
            client.setex(key, ttl_seconds, serialized)
            return
        except Exception as e:
            logger.warning("Redis set error: %s", e)

    # In-memory fallback
    now = time.time()
    if len(_MEMORY_CACHE) >= _MEMORY_CACHE_MAX:
        # Prune oldest 20% entries
        sorted_keys = sorted(_MEMORY_CACHE.keys(), key=lambda k: _MEMORY_CACHE[k][0])
        for k in sorted_keys[: (_MEMORY_CACHE_MAX // 5)]:
            _MEMORY_CACHE.pop(k, None)

    _MEMORY_CACHE[key] = (now + ttl_seconds, serialized)


def invalidate_search_cache() -> None:
    """Clear all cached search queries when new questions are published, updated, or deleted."""
    client = get_redis_client()
    if client:
        try:
            # Delete keys matching search:*
            cursor = 0
            while True:
                cursor, keys = client.scan(cursor=cursor, match="search:*", count=100)
                if keys:
                    client.delete(*keys)
                if cursor == 0:
                    break
            logger.info("Invalidated Redis search query cache.")
        except Exception as e:
            logger.warning("Failed to invalidate Redis cache: %s", e)

    # Clear in-memory cache
    _MEMORY_CACHE.clear()
