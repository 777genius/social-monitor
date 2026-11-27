"""Select the legacy X document required by Scweet's webpack parsers."""
from __future__ import annotations

import logging
from typing import Any

LEGACY_BOOTSTRAP_URL = "https://x.com/i/jf/"
LOGGER = logging.getLogger("Scweet.client")


def with_legacy_bootstrap(scweet_type: type[Any]) -> type[Any]:
    """Preserve Scweet's cookies, proxy and cache while selecting its document."""
    class LegacyBootstrapScweet(scweet_type):
        def _init_core(self, *args: Any, **kwargs: Any) -> None:
            scrape_manifest = self._config.manifest_scrape_on_init
            update_manifest = self._config.manifest_update_on_init
            self._config.manifest_scrape_on_init = False
            if scrape_manifest:
                self._config.manifest_update_on_init = False
            try:
                super()._init_core(*args, **kwargs)
            finally:
                self._config.manifest_scrape_on_init = scrape_manifest
                self._config.manifest_update_on_init = update_manifest
            self._transaction_id_provider.home_url = LEGACY_BOOTSTRAP_URL
            if not scrape_manifest:
                return
            try:
                provider = self._manifest_provider
                cached = provider.repo.get_cached("x-live-scrape")
                if (
                    isinstance(cached, dict)
                    and isinstance(cached.get("manifest"), dict)
                    and provider._coerce_manifest(cached["manifest"]) is not None
                ):
                    LOGGER.info("Using cached live manifest")
                    return
                from Scweet.manifest import scrape_manifest_from_x

                raw = scrape_manifest_from_x(
                    home_url=LEGACY_BOOTSTRAP_URL,
                    **self._bootstrap_page_kwargs(),
                )
                manifest = provider._coerce_manifest(raw)
                if manifest is None:
                    raise ValueError("invalid manifest")
                provider.repo.set_cached(
                    "x-live-scrape",
                    manifest.model_dump(mode="json"),
                    ttl_s=self._config.manifest_ttl_s,
                )
                LOGGER.info("Live manifest scraped successfully")
            except Exception:
                LOGGER.warning("Live manifest scrape failed; using cached manifest")

    return LegacyBootstrapScweet
