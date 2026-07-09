from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


@dataclass(frozen=True)
class AccountLimitProfile:
    daily_requests: int
    daily_tweets: int
    priority: int = 100


def load_account_limit_profiles(
    *,
    inline_json: str | None,
    file_path: str | None,
) -> dict[str, AccountLimitProfile]:
    profiles: dict[str, AccountLimitProfile] = {}
    for payload in _profile_payloads(inline_json=inline_json, file_path=file_path):
        profiles.update(_parse_profiles(payload))

    return profiles


def _profile_payloads(
    *,
    inline_json: str | None,
    file_path: str | None,
) -> tuple[Any, ...]:
    payloads: list[Any] = []
    if file_path is not None:
        payloads.append(json.loads(Path(file_path).read_text()))
    if inline_json is not None:
        payloads.append(json.loads(inline_json))

    return tuple(payloads)


def _parse_profiles(payload: Any) -> dict[str, AccountLimitProfile]:
    if isinstance(payload, Mapping):
        accounts = payload.get("accounts")
        if isinstance(accounts, list):
            return _parse_profile_list(accounts)

        return _parse_profile_mapping(payload)

    if isinstance(payload, list):
        return _parse_profile_list(payload)

    raise ValueError("Account limit profiles must be a JSON object or list")


def _parse_profile_mapping(
    payload: Mapping[str, Any],
) -> dict[str, AccountLimitProfile]:
    result: dict[str, AccountLimitProfile] = {}
    for username, config in payload.items():
        if username == "accounts":
            continue
        if not isinstance(config, Mapping):
            continue
        result[_normalize_username(username)] = _parse_profile(config)

    return result


def _parse_profile_list(items: list[Any]) -> dict[str, AccountLimitProfile]:
    result: dict[str, AccountLimitProfile] = {}
    for item in items:
        if not isinstance(item, Mapping):
            continue
        username = _optional_string(item.get("username"))
        if username is None:
            continue
        result[_normalize_username(username)] = _parse_profile(item)

    return result


def _parse_profile(config: Mapping[str, Any]) -> AccountLimitProfile:
    daily_requests = _positive_int(
        config.get("dailyRequests", config.get("daily_requests")),
        "dailyRequests",
    )
    daily_tweets = _positive_int(
        config.get("dailyTweets", config.get("daily_tweets")),
        "dailyTweets",
    )

    return AccountLimitProfile(
        daily_requests=daily_requests,
        daily_tweets=daily_tweets,
        priority=_priority_int(config.get("priority"), "priority"),
    )


def _positive_int(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a positive integer")
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit() and int(stripped) > 0:
            return int(stripped)

    raise ValueError(f"{label} must be a positive integer")


def _priority_int(value: Any, label: str) -> int:
    if value is None:
        return 100
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a non-negative integer")
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)

    raise ValueError(f"{label} must be a non-negative integer")


def _optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()

    return stripped or None


def _normalize_username(value: str) -> str:
    return value.strip().lower()
