"""One attributed embedded post; never substitute it for the quoting author's text."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping
from urllib.parse import urlparse
import re


@dataclass(frozen=True)
class XQuotedPost:
    tweet_id: str
    canonical_url: str
    text: str
    author_handle: str
    published_at: datetime


def quoted_post_from_scweet_record(record: Mapping[str, Any]) -> XQuotedPost | None:
    """Pinned Scweet >=5.6 supplies the full one-level `quoted_tweet` record.

    `embedded_text` is a truncated display string and has no independent identity;
    it deliberately cannot establish source capture or replace a missing record.
    """
    value = record.get("quoted_tweet")
    if not isinstance(value, Mapping):
        return None
    tweet_id = value.get("tweet_id")
    parent_id = record.get("tweet_id")
    text = value.get("text")
    user = value.get("user")
    handle = user.get("screen_name") if isinstance(user, Mapping) else None
    url = value.get("tweet_url")
    if not isinstance(tweet_id, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", tweet_id):
        return None
    if tweet_id == parent_id or not isinstance(text, str) or not text.strip() or len(text.encode("utf-8")) > 256_000:
        return None
    declared_id = record.get("quoted_status_id")
    if declared_id is not None and declared_id != tweet_id:
        return None
    if not isinstance(handle, str) or not re.fullmatch(r"[A-Za-z0-9_]{1,15}", handle):
        return None
    expected_url = f"https://x.com/{handle}/status/{tweet_id}"
    if url is not None:
        if not isinstance(url, str):
            return None
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc.lower() not in {"x.com", "twitter.com"} or parsed.query or parsed.fragment:
            return None
        if parsed.path.lower() != f"/{handle}/status/{tweet_id}".lower():
            return None
    timestamp = value.get("timestamp")
    if not isinstance(timestamp, str):
        return None
    try:
        published_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        try:
            published_at = datetime.strptime(timestamp, "%a %b %d %H:%M:%S %z %Y")
        except ValueError:
            return None
    if published_at.tzinfo is None:
        return None
    return XQuotedPost(tweet_id, expected_url, text, handle, published_at.astimezone(timezone.utc))
