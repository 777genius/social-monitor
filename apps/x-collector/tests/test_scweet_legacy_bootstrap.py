import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from x_collector.scweet_bootstrap import LEGACY_BOOTSTRAP_URL, with_legacy_bootstrap


def test_bootstrap_uses_legacy_document_for_manifest_and_transactions() -> None:
    calls = []
    manifest_module = ModuleType("Scweet.manifest")
    manifest_module.scrape_manifest_from_x = lambda **kw: calls.append(kw) or {"fixture": True}

    class Repo:
        def get_cached(self, key):
            assert key == "x-live-scrape"
            return None

        def set_cached(self, key, value, *, ttl_s):
            calls.append((key, value, ttl_s))

    class Provider:
        repo = Repo()

        def _coerce_manifest(self, raw):
            assert raw == {"fixture": True}
            return SimpleNamespace(model_dump=lambda **kw: {"normalized": True})

    class FakeScweet:
        def __init__(self) -> None:
            self._config = SimpleNamespace(manifest_scrape_on_init=True, manifest_update_on_init=True, manifest_ttl_s=60)
            self._init_core(provision=True)

        def _init_core(self, *, provision: bool) -> None:
            assert provision and not self._config.manifest_scrape_on_init
            assert not self._config.manifest_update_on_init
            self._transaction_id_provider = SimpleNamespace(home_url="https://x.com/home")
            self._manifest_provider = Provider()

        def _bootstrap_page_kwargs(self):
            return {"cookies": "fixture", "proxy": "fixture"}

    scweet_module = ModuleType("Scweet")
    scweet_module.__path__ = []
    with patch.dict(sys.modules, {"Scweet": scweet_module, "Scweet.manifest": manifest_module}):
        client = with_legacy_bootstrap(FakeScweet)()
    assert calls == [
        {"home_url": LEGACY_BOOTSTRAP_URL, "cookies": "fixture", "proxy": "fixture"},
        ("x-live-scrape", {"normalized": True}, 60),
    ]
    assert client._transaction_id_provider.home_url == LEGACY_BOOTSTRAP_URL
    assert client._config.manifest_scrape_on_init


def test_disabled_manifest_scrape_preserves_normal_update_and_skips_scrape() -> None:
    class FakeScweet:
        def __init__(self) -> None:
            self._config = SimpleNamespace(
                manifest_scrape_on_init=False, manifest_update_on_init=True
            )
            self._init_core()

        def _init_core(self) -> None:
            assert self._config.manifest_update_on_init
            self._transaction_id_provider = SimpleNamespace(home_url="old")

    client = with_legacy_bootstrap(FakeScweet)()
    assert client._transaction_id_provider.home_url == LEGACY_BOOTSTRAP_URL
    assert client._config.manifest_update_on_init
    assert not client._config.manifest_scrape_on_init


def test_manifest_failure_keeps_client_available(caplog) -> None:
    class FakeScweet:
        def __init__(self) -> None:
            self._config = SimpleNamespace(
                manifest_scrape_on_init=True, manifest_update_on_init=False
            )
            self._init_core()

        def _init_core(self) -> None:
            self._transaction_id_provider = SimpleNamespace(home_url="old")
            self._manifest_provider = SimpleNamespace(
                repo=SimpleNamespace(get_cached=lambda _: None)
            )

        def _bootstrap_page_kwargs(self):
            raise RuntimeError("sensitive fixture details")

    scweet_module = ModuleType("Scweet")
    scweet_module.__path__ = []
    manifest_module = ModuleType("Scweet.manifest")
    manifest_module.scrape_manifest_from_x = lambda **kw: None
    with patch.dict(sys.modules, {"Scweet": scweet_module, "Scweet.manifest": manifest_module}):
        client = with_legacy_bootstrap(FakeScweet)()
    assert client._transaction_id_provider.home_url == LEGACY_BOOTSTRAP_URL
    assert "Live manifest scrape failed" in caplog.text
    assert "sensitive fixture details" not in caplog.text
