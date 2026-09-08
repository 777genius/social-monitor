"""Detached proposed descriptors for one canonical invocation per lane.

No send permissions, runtime observations, SDK model validation, or admission.
The caller supplies public profile data and complete scalar requests offline.
"""
from __future__ import annotations

import ast
import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from string import Formatter

from .canonical_sdk_builders import PinnedSdkBuilders, SourcePinMismatch
from .domain import DailySearchRequest, SearchProduct
from .search_plan import plan_scweet_search_passes


REPOSITORY_PINS = {
    "config.py": "6a5be45e5ac39defd34e61a805aa67f3625ca6e98e3afd0e8f0588d4a277d3d5",
    "domain.py": "867469a50eb49ffa821b528505db8e084dc7e60f58a829a5f7ebe2cd2faa6666",
    "search_plan.py": "3a82bea0aebd1146c1a9e63ac63f8a1ffdcfb221af7ebecc03782c678a837875",
    "scweet_adapter.py": "fd9486970c86c76dba6934140a098a5d539cff2e1c4529ced436fd7ff7417ac2",
    "search_budget.py": "494333b7bcbcb47282ae91502bb9f350fde092f654cf10568050478ab79e091f",
}
REQUEST_FIELDS = frozenset(DailySearchRequest.__dataclass_fields__)
PROFILE_FIELDS = frozenset({
    "nSplits", "minIntervalSeconds", "apiPageSize", "pageSizeHint",
    "pageSizeHintSource", "maxEmptyPages", "concurrency", "profileHash",
    "operationManifestHash", "queryId", "endpoint", "features", "fieldToggles",
})


class PlanningError(ValueError):
    def __init__(self, code: str, path: str):
        super().__init__(code + ":" + path)
        self.code, self.path = code, path


def semantic_hash(value) -> str:
    def canonical(item):
        if item is None or type(item) in (bool, str):
            return json.dumps(item, ensure_ascii=False)
        if type(item) is int and abs(item) <= 9007199254740991:
            return str(item)
        if type(item) is list:
            return "[" + ",".join(canonical(v) for v in item) + "]"
        if type(item) is dict and all(type(key) is str for key in item):
            return "{" + ",".join(canonical(key) + ":" + canonical(item[key])
                                  for key in sorted(item, key=lambda k: k.encode("utf-16-be"))) + "}"
        raise PlanningError("BOUNDS_OVERFLOW", "semanticValue")
    try:
        return hashlib.sha256(canonical(value).encode()).hexdigest()
    except (UnicodeError, RecursionError) as error:
        raise PlanningError("UNSUPPORTED_PROFILE", "semanticValue.unicode") from error


def closed(value, fields, path):
    if type(value) is not dict:
        raise PlanningError("MISSING_INPUT", path)
    missing = fields - set(value)
    if missing:
        raise PlanningError("MISSING_INPUT", path + "." + sorted(missing)[0])
    if set(value) - fields:
        raise PlanningError("UNSUPPORTED_PROFILE", path + ".unknownField")


def integer(value, minimum, maximum, path):
    if type(value) is not int or not minimum <= value <= maximum:
        raise PlanningError("UNSUPPORTED_PROFILE", path)


def date_window_builder():
    source = Path(__file__).parent
    data = {}
    for name, expected in REPOSITORY_PINS.items():
        try:
            data[name] = (source / name).read_bytes()
        except OSError as error:
            raise SourcePinMismatch(name) from error
        if hashlib.sha256(data[name]).hexdigest() != expected:
            raise SourcePinMismatch(name)
    node = next(node for node in ast.parse(data["scweet_adapter.py"]).body
                if isinstance(node, ast.FunctionDef) and node.name == "scweet_date_window")
    namespace = {"DailySearchRequest": DailySearchRequest, "UTC": UTC, "timedelta": timedelta}
    exec(compile(ast.Module(body=[node], type_ignores=[]), "<pinned-date-window>", "exec"), namespace)
    return namespace["scweet_date_window"]


class ScalarRequest:
    """Inert builder input; deliberately makes no Pydantic parity claim."""
    def __init__(self, payload):
        self.payload = payload
        for field in ("since", "until", "lang", "display_type"):
            setattr(self, field, payload[field])

    def model_dump(self, *, mode):
        assert mode == "python"
        return dict(self.payload)


class PublicManifest:
    def __init__(self, profile):
        self.profile = profile
        self.query_ids = {"search_timeline": profile["queryId"]}
        self.endpoints = {"search_timeline": profile["endpoint"]}

    def features_for(self, operation):
        assert operation == "search_timeline"
        return self.profile["features"]

    def field_toggles_for(self, operation):
        assert operation == "search_timeline"
        return self.profile["fieldToggles"]


def validate_profile(profile):
    closed(profile, PROFILE_FIELDS, "profile")
    # Collector config pins n_splits1..24 and max_empty_pages1..10; other SDK integers remain safe-sized.
    for field, minimum, maximum in (("nSplits", 1, 24), ("minIntervalSeconds", 1, 9007199254740991),
                                    ("apiPageSize", 1, 100), ("pageSizeHint", 1, 100),
                                    ("maxEmptyPages", 1, 10), ("concurrency", 1, 9007199254740991)):
        integer(profile[field], minimum, maximum, "profile." + field)
    if profile["pageSizeHintSource"] != "runner-config" or profile["pageSizeHint"] != profile["apiPageSize"]:
        raise PlanningError("UNSUPPORTED_PROFILE", "profile.pageSizeHintSource")
    if profile["pageSizeHint"] != 20:
        raise PlanningError("UNSUPPORTED_PROFILE", "profile.count")
    for field in ("profileHash", "operationManifestHash", "queryId", "endpoint"):
        if type(profile[field]) is not str or not profile[field].strip():
            raise PlanningError("MISSING_INPUT", "profile." + field)
    try:
        for _, field, spec, conversion in Formatter().parse(profile["endpoint"]):
            if field is not None and (field != "query_id" or spec or conversion):
                raise ValueError("unsupported placeholder")
    except ValueError as error:
        raise PlanningError("UNSUPPORTED_PROFILE", "profile.endpoint") from error
    for field in ("features", "fieldToggles"):
        value = profile[field]
        if value is not None and (type(value) is not dict or any(
                type(key) is not str or type(flag) is not bool for key, flag in value.items())):
            raise PlanningError("UNSUPPORTED_PROFILE", "profile." + field)
    if profile["operationManifestHash"] != semantic_hash({key: profile[key] for key in (
            "queryId", "endpoint", "features", "fieldToggles")}) or profile["profileHash"] != semantic_hash({
                key: value for key, value in profile.items() if key not in ("profileHash", "operationManifestHash")}):
        raise PlanningError("SDK_EXPANSION_MISMATCH", "profile.hashes")


def read_request(raw):
    closed(raw, REQUEST_FIELDS, "request")
    for field in ("request_id", "tenant_id", "workspace_id", "source_binding_id", "scan_job_id",
                  "correlation_id", "query", "window_end"):
        if type(raw[field]) is not str or not raw[field].strip():
            raise PlanningError("MISSING_INPUT", "request." + field)
        try:
            raw[field].encode("utf8")
        except UnicodeError as error:
            raise PlanningError("UNSUPPORTED_PROFILE", "request." + field) from error
    for field in ("language", "cursor"):
        if raw[field] is not None and type(raw[field]) is not str:
            raise PlanningError("MISSING_INPUT", "request." + field)
    if raw["cursor"] is not None:
        raise PlanningError("UNSUPPORTED_PROFILE", "request.cursor")
    for field in ("min_likes", "min_retweets", "min_replies"):
        if raw[field] is not None:
            integer(raw[field], 0, 1000000, "request." + field)
    integer(raw["window_hours"], 1, 72, "request.window_hours")
    for field in ("limit_per_product", "max_items"):
        integer(raw[field], 1, 100, "request." + field)
    if type(raw["search_products"]) is not list or any(p not in ("top", "latest") for p in raw["search_products"]):
        raise PlanningError("UNSUPPORTED_PROFILE", "request.search_products")
    try:
        end = datetime.fromisoformat(raw["window_end"].replace("Z", "+00:00"))
    except ValueError as error:
        raise PlanningError("INVALID_SCOPE_OR_WINDOW", "request.window_end") from error
    if end.tzinfo is None or end.utcoffset() != timedelta(0):
        raise PlanningError("INVALID_SCOPE_OR_WINDOW", "request.window_end")
    try:
        end - timedelta(hours=raw["window_hours"])
    except OverflowError as error:
        raise PlanningError("INVALID_SCOPE_OR_WINDOW", "request.window_end") from error
    return DailySearchRequest(**{**raw, "window_end": end,
                                 "search_products": tuple(SearchProduct(p) for p in raw["search_products"])})


def compile_expansion(lanes, profile, sdk: PinnedSdkBuilders):
    """Return JSON-safe descriptors; input cursor is ignored, never propagated."""
    try:
        # Validate exact JSON scalar/container types before serialization can invoke custom code.
        semantic_hash(lanes)
        semantic_hash(profile)
        lanes, profile = json.loads(json.dumps(lanes)), json.loads(json.dumps(profile))
        if type(lanes) is not list or not lanes:
            raise PlanningError("MISSING_INPUT", "lanes")
        validate_profile(profile)
        calendar_window = date_window_builder()
        api, manifest = sdk.api(profile["apiPageSize"]), PublicManifest(profile)
        result, seen = [], set()
        for lane in lanes:
            closed(lane, {"day", "laneOrdinal", "request"}, "lane")
            integer(lane["laneOrdinal"], 0, 15, "lane.laneOrdinal")
            request = read_request(lane["request"])
            if sdk.has_overriding_operators(request.query):
                raise PlanningError("UNSUPPORTED_PROFILE", "request.query.overridingOperators")
            day = lane["day"]
            if day != (request.window_end - timedelta(hours=request.window_hours)).date().isoformat():
                raise PlanningError("INVALID_SCOPE_OR_WINDOW", "lane.day")
            prefix = f"{day}/l{lane['laneOrdinal']}/i0"
            if prefix in seen:
                raise PlanningError("DUPLICATE_COORDINATE", "lane")
            seen.add(prefix)
            since, until = calendar_window(request)
            # Runner normalization source parity only, not executed Runner qualification.
            intervals = sdk.split_intervals(since + "_00:00:00_UTC", until + "_23:59:59_UTC",
                                            profile["nSplits"], profile["minIntervalSeconds"])
            passes = []
            for ordinal, search_pass in enumerate(plan_scweet_search_passes(request)):
                pass_id = f"{prefix}/p{ordinal}"
                streams = []
                for split, (start, end) in enumerate(intervals):
                    payload = {"search_query": request.query, "since": start, "until": end,
                               "lang": request.language, "tweet_type": "originals_only",
                               "display_type": "Top" if search_pass.product == SearchProduct.TOP else "Latest", "min_likes": search_pass.min_likes,
                               "min_retweets": search_pass.min_retweets, "min_replies": search_pass.min_replies}
                    params = api._build_graphql_params(ScalarRequest(payload), None, manifest,
                                                      runtime_hints={"page_size": profile["pageSizeHint"]})
                    variables = json.loads(params["variables"])
                    streams.append({"streamId": f"{pass_id}/s{split}", "passId": pass_id,
                                    "splitOrdinal": split, "splitWindow": {"since": start, "until": end},
                                    "rawQuery": variables["rawQuery"],
                                    "rawQueryHash": hashlib.sha256(variables["rawQuery"].encode()).hexdigest(),
                                    "normalizedRequestHash": semantic_hash(sdk.normalize(payload)[0]),
                                    "parametersWithoutCursor": params, "parametersHash": semantic_hash(params),
                                    "publicUrl": api._resolve_search_url(manifest), "profileHash": profile["profileHash"],
                                    "product": variables["product"], "pageLimit": 5})
                passes.append({"passId": pass_id, "ordinal": ordinal, "label": search_pass.label,
                               "product": search_pass.product.value, "limit": search_pass.limit,
                               "minLikes": search_pass.min_likes, "minRetweets": search_pass.min_retweets,
                               "minReplies": search_pass.min_replies, "globalStopScope": pass_id,
                               "budgetSelectionSourceHash": REPOSITORY_PINS["search_budget.py"],
                               "stopRuleSourceHash": hashlib.sha256(sdk.sources["Scweet/runner.py"]).hexdigest(),
                               "streams": streams})
            result.append({"invocationId": prefix, "laneId": f"{day}/l{lane['laneOrdinal']}", "ordinal": 0,
                           "requestHash": semantic_hash(lane["request"]),
                           "request": json.loads(json.dumps(lane["request"])),
                           "continuationPolicy": "canonical-no-external-cursor-at-source-pin", "passes": passes})
        return {"ok": True, "value": {"invocations": result, "profileHash": semantic_hash(profile)}}
    except SourcePinMismatch:
        return {"ok": False, "error": {"code": "SOURCE_PIN_MISMATCH", "path": "sources"}}
    except PlanningError as error:
        return {"ok": False, "error": {"code": error.code, "path": error.path}}
