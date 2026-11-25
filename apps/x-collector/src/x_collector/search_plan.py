from __future__ import annotations

from dataclasses import dataclass

from .domain import DailySearchRequest, SearchProduct


@dataclass(frozen=True)
class ScweetSearchPass:
    label: str
    product: SearchProduct
    limit: int
    min_likes: int | None
    min_retweets: int | None
    min_replies: int | None


def plan_scweet_search_passes(
    request: DailySearchRequest,
) -> tuple[ScweetSearchPass, ...]:
    products = normalize_products(request.search_products)
    passes: list[ScweetSearchPass] = []

    if SearchProduct.TOP in products:
        passes.append(
            ScweetSearchPass(
                label="top_base",
                product=SearchProduct.TOP,
                limit=request.limit_per_product,
                min_likes=request.min_likes,
                min_retweets=request.min_retweets,
                min_replies=request.min_replies,
            ),
        )
        strict = strict_thresholds(request)
        if strict != (
            request.min_likes,
            request.min_retweets,
            request.min_replies,
        ):
            passes.append(
                ScweetSearchPass(
                    label="top_strict",
                    product=SearchProduct.TOP,
                    limit=request.limit_per_product,
                    min_likes=strict[0],
                    min_retweets=strict[1],
                    min_replies=strict[2],
                ),
            )

    if SearchProduct.LATEST in products:
        passes.append(
            ScweetSearchPass(
                label="latest_discovery",
                product=SearchProduct.LATEST,
                limit=request.limit_per_product,
                min_likes=latest_discovery_min(request.min_likes, ceiling=5),
                min_retweets=latest_discovery_min(request.min_retweets, ceiling=1),
                min_replies=latest_discovery_min(request.min_replies, ceiling=1),
            ),
        )

    return tuple(dedupe_passes(passes))


def normalize_products(
    products: tuple[SearchProduct, ...],
) -> tuple[SearchProduct, ...]:
    normalized: list[SearchProduct] = []
    for product in products or (SearchProduct.TOP, SearchProduct.LATEST):
        if product not in normalized:
            normalized.append(product)

    if SearchProduct.TOP not in normalized:
        normalized.insert(0, SearchProduct.TOP)
    if SearchProduct.LATEST not in normalized:
        normalized.append(SearchProduct.LATEST)

    return tuple(normalized)


def strict_thresholds(
    request: DailySearchRequest,
) -> tuple[int | None, int | None, int | None]:
    return (
        strict_minimum(request.min_likes, 50),
        strict_minimum(request.min_retweets, 10),
        strict_minimum(request.min_replies, 5),
    )


def strict_minimum(value: int | None, floor: int) -> int:
    if value is None:
        return floor

    return max(value * 3, floor)


def latest_discovery_min(value: int | None, *, ceiling: int) -> int | None:
    if value is None:
        return None

    return min(value, ceiling)


def dedupe_passes(
    passes: list[ScweetSearchPass],
) -> list[ScweetSearchPass]:
    seen: set[tuple[SearchProduct, int | None, int | None, int | None]] = set()
    result: list[ScweetSearchPass] = []

    for search_pass in passes:
        key = (
            search_pass.product,
            search_pass.min_likes,
            search_pass.min_retweets,
            search_pass.min_replies,
        )
        if key in seen:
            continue

        seen.add(key)
        result.append(search_pass)

    return result
