"""Bounded known-id acquisition through the same pinned SDK/account authority."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
import re

from .domain import (DailySearchResult, PostLookupRequest, SearchProduct,
                     XCollectorInvalidRequestError, XCollectorRateLimitError,
                     XCollectorRun, XCollectorUnavailableError)
from .scweet_run_identity import ScweetRunIdentityTracker


def validate_post_lookup(request: PostLookupRequest) -> None:
    if not 1 <= len(request.tweet_ids) <= 50 or len(set(request.tweet_ids)) != len(request.tweet_ids):
        raise XCollectorInvalidRequestError("Lookup requires 1-50 distinct post ids")
    if any(not re.fullmatch(r"[1-9][0-9]{0,19}", value) for value in request.tweet_ids):
        raise XCollectorInvalidRequestError("Lookup post identity is invalid")
    if any(not value.strip() or len(value) > 200 for value in (
        request.request_id, request.tenant_id, request.workspace_id,
        request.source_binding_id, request.scan_job_id, request.correlation_id,
    )):
        raise XCollectorInvalidRequestError("Lookup scope is incomplete")


def execute_post_lookup(request, *, clock, ledger, prepare_accounts, observer,
                        start_execution, normalize_record, classify_error, db_path):
    validate_post_lookup(request)
    started_at = clock.now()
    if ledger is None:
        raise XCollectorUnavailableError("Post lookup requires accounted capacity")
    prepare_accounts()
    snapshot = ledger.snapshot(clock.now())
    if snapshot is None or snapshot.total_remaining_requests < 1 or snapshot.total_remaining_tweets < len(request.tweet_ids):
        raise XCollectorRateLimitError("Post lookup account budget exhausted")
    usage = observer.begin_lookup(request)
    run_identity = ScweetRunIdentityTracker(db_path)
    try:
        # No automatic failover/retry: a failed response can still have spent a request.
        with run_identity:
            records = start_execution().get_tweet_info(list(request.tweet_ids), save=False)
        usage = replace(usage, collector_run_id=run_identity.collector_run_id)
        if not isinstance(records, list):
            raise XCollectorUnavailableError("Post lookup returned an invalid envelope")
        posts = {}
        conflicts = set()
        for record in records:
            if not isinstance(record, Mapping) or record.get("tweet_id") not in request.tweet_ids:
                continue
            post = normalize_record(record, SearchProduct.ID_LOOKUP)
            if post is None:
                continue
            if post.tweet_id in posts and posts[post.tweet_id] != post:
                conflicts.add(post.tweet_id)
            posts[post.tweet_id] = post
        accepted = tuple(posts[value] for value in request.tweet_ids if value in posts and value not in conflicts)
        observer.complete_pass_success(request, usage, fetched_count=len(records), accepted_count=len(accepted))
        return DailySearchResult(accepted, None, (), XCollectorRun(
            "scweet_post_lookup", "scweet-5.8.0", started_at, clock.now(),
            len(request.tweet_ids), len(records), len(accepted), len(accepted) != len(request.tweet_ids)))
    except Exception as exc:
        usage = replace(usage, collector_run_id=run_identity.collector_run_id)
        observer.complete_pass_failure(request, usage, failure_kind=type(exc).__name__)
        raise classify_error(exc) from exc
