from __future__ import annotations

import json

import pytest

from x_collector.account_limit_profiles import load_account_limit_profiles


def test_load_account_limit_profiles_from_inline_mapping() -> None:
    profiles = load_account_limit_profiles(
        inline_json=json.dumps(
            {
                "PremiumUser": {
                    "dailyRequests": 120,
                    "dailyTweets": 2_000,
                    "priority": 0,
                },
            },
        ),
        file_path=None,
    )

    assert profiles["premiumuser"].daily_requests == 120
    assert profiles["premiumuser"].daily_tweets == 2_000
    assert profiles["premiumuser"].priority == 0


def test_load_account_limit_profiles_from_file_and_inline_override(
    tmp_path,
) -> None:
    profile_file = tmp_path / "account-limits.json"
    profile_file.write_text(
        json.dumps(
            {
                "accounts": [
                    {
                        "username": "premium",
                        "daily_requests": 90,
                        "daily_tweets": 1_500,
                    },
                ],
            },
        ),
    )

    profiles = load_account_limit_profiles(
        inline_json=json.dumps(
            {
                "premium": {
                    "dailyRequests": 120,
                    "dailyTweets": 2_000,
                },
            },
        ),
        file_path=str(profile_file),
    )

    assert profiles["premium"].daily_requests == 120
    assert profiles["premium"].daily_tweets == 2_000
    assert profiles["premium"].priority == 100


def test_load_account_limit_profiles_rejects_missing_limits() -> None:
    with pytest.raises(ValueError, match="dailyRequests"):
        load_account_limit_profiles(
            inline_json=json.dumps({"premium": {"dailyTweets": 2_000}}),
            file_path=None,
        )


def test_load_account_limit_profiles_rejects_negative_priority() -> None:
    with pytest.raises(ValueError, match="priority"):
        load_account_limit_profiles(
            inline_json=json.dumps(
                {
                    "premium": {
                        "dailyRequests": 120,
                        "dailyTweets": 2_000,
                        "priority": -1,
                    },
                },
            ),
            file_path=None,
        )
