"""Contract check on the pinned Scweet release, fully offline.

X answers its login page, which names no main.js bundle, to a request that does
not carry the cookies of an account it accepts. Scweet 5.8.0 scraped the live
manifest with an anonymous session, so every collector init logged
"Live manifest scrape failed" and silently fell back to bundled query ids.
Scweet 5.8.1 fixed that (Altimis/Scweet#197). This keeps a downgrade or a future
SDK change from bringing the anonymous scrape back unnoticed.

The SDK is imported inside the test under ``patch.dict(sys.modules)`` so the
rest of the suite keeps proving that collector code never imports it eagerly.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import patch

import pytest


ACCOUNT_COOKIES = {
    "auth_token": "fixture-auth-manifest",
    "ct0": "fixture-csrf-manifest",
}
FIXTURE_PROXY = "http://fixture-proxy.invalid:8080"


@dataclass
class LoginPage:
    url: str
    status_code: int = 200
    text: str = "<html><body>Log in to X</body></html>"


@dataclass
class RecordingSession:
    kwargs: dict[str, Any]
    requested: list[str] = field(default_factory=list)
    closed: bool = False

    def get(self, url: str, **_kwargs: Any) -> LoginPage:
        self.requested.append(url)
        return LoginPage(url=url)

    def close(self) -> None:
        self.closed = True


def test_live_manifest_scrape_sends_account_cookies_and_proxy() -> None:
    sessions: list[RecordingSession] = []

    def open_session(**kwargs: Any) -> RecordingSession:
        session = RecordingSession(kwargs=kwargs)
        sessions.append(session)
        return session

    with patch.dict(sys.modules):
        from curl_cffi import requests as curl_requests
        from Scweet import manifest as scweet_manifest
        from Scweet.exceptions import ManifestError

        with (
            patch.object(curl_requests, "Session", open_session),
            pytest.raises(ManifestError, match="Could not find main.js bundle URL"),
        ):
            scweet_manifest.scrape_manifest_from_x(
                cookies=ACCOUNT_COOKIES,
                proxy=FIXTURE_PROXY,
            )

    assert len(sessions) == 1
    session = sessions[0]
    assert session.kwargs.get("cookies") == ACCOUNT_COOKIES
    assert session.kwargs.get("proxies")
    assert session.requested == ["https://x.com/home"]
    assert session.closed
