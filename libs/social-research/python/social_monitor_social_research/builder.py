from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any

JsonDict = dict[str, Any]


@dataclass(frozen=True)
class SocialResearchRequestBuilder:
    topic: str
    values: JsonDict = field(default_factory=dict)

    def preset(self, preset: str) -> "SocialResearchRequestBuilder":
        return self._with("preset", preset)

    def source(self, source_key: str) -> "SocialResearchRequestBuilder":
        return self.sources(source_key)

    def sources(self, *source_keys: str) -> "SocialResearchRequestBuilder":
        return self._append("sources", list(source_keys))

    def account(
        self,
        handle: str,
        *,
        source_key: str | None = None,
        include_posts: bool | None = None,
        include_mentions: bool | None = None,
    ) -> "SocialResearchRequestBuilder":
        value: JsonDict = {"handle": handle}
        if source_key is not None:
            value["sourceKey"] = source_key
        if include_posts is not None:
            value["includePosts"] = include_posts
        if include_mentions is not None:
            value["includeMentions"] = include_mentions
        return self._append("accounts", [value])

    def product(self, product: str) -> "SocialResearchRequestBuilder":
        return self.products(product)

    def products(self, *products: str) -> "SocialResearchRequestBuilder":
        return self._append("products", list(products))

    def keyword(self, keyword: str) -> "SocialResearchRequestBuilder":
        return self.keywords(keyword)

    def keywords(self, *keywords: str) -> "SocialResearchRequestBuilder":
        return self._append("keywords", list(keywords))

    def community(
        self,
        name: str,
        *,
        source_key: str | None = None,
        listings: list[str] | None = None,
    ) -> "SocialResearchRequestBuilder":
        value: JsonDict = {"name": name}
        if source_key is not None:
            value["sourceKey"] = source_key
        if listings is not None:
            value["listings"] = listings
        return self._append("communities", [value])

    def url(self, url: str) -> "SocialResearchRequestBuilder":
        return self.urls(url)

    def urls(self, *urls: str) -> "SocialResearchRequestBuilder":
        return self._append("urls", list(urls))

    def build(self) -> JsonDict:
        return {"topic": self.topic, **self.values}

    def _with(self, key: str, value: Any) -> "SocialResearchRequestBuilder":
        return replace(self, values={**self.values, key: value})

    def _append(
        self,
        key: str,
        values: list[Any],
    ) -> "SocialResearchRequestBuilder":
        return replace(self, values={**self.values, key: [*self.values.get(key, []), *values]})


def create_social_research_request_builder(topic: str) -> SocialResearchRequestBuilder:
    return SocialResearchRequestBuilder(topic=topic)
