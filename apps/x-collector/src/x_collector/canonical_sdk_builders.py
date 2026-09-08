"""Offline, source-pinned pure builders. Never imports the SDK package.

This seam provides source parity only; it does not validate SDK models or
qualify the Runner, transport, account selection, or deployment manifest.
"""
from __future__ import annotations

import ast
import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
from types import MappingProxyType
from typing import Any, Optional


MANIFEST_SHA256 = "0aa986455c1775520b7621a61c57204924c4ec12b6a5a9371a6db7412ca7797a"
API_METHODS = frozenset({
    "_build_variables", "_build_graphql_params", "_resolve_page_size",
    "_coerce_positive_int", "_resolve_search_url",
})
QUERY_FUNCTIONS = frozenset({
    "_as_str", "_normalize_string_list", "_normalize_handle_list",
    "_normalize_hashtag", "_boolish", "_as_non_negative_int",
    "_normalize_tweet_type", "_apply_legacy_aliases", "normalize_search_input",
    "_format_query_term", "_query_time_token", "_query_has_operator",
    "_query_has_any_min_operator", "_query_has_any_filter_operator",
    "_build_operator_group", "build_effective_search_query",
})
QUERY_CONSTANTS = frozenset({
    "_TWEET_TYPE_VALUES", "_LIST_FIELDS", "_BOOL_FIELDS", "_INT_FIELDS",
    "_LEGACY_KEY_ALIASES", "_HANDLE_PATTERN",
})


class SourcePinMismatch(ValueError):
    """A required source is absent, unsafe, or different from the accepted pin."""


def verified_sources(root: Path) -> MappingProxyType:
    """Read every byte before executing any builder; retain detached bytes."""
    try:
        manifest_bytes = (root / "manifest.json").read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest() != MANIFEST_SHA256:
            raise SourcePinMismatch("manifest.sha256")
        entries = json.loads(manifest_bytes)["files"]
        if len(entries) != 30:
            raise SourcePinMismatch("manifest.files")
        sources = {}
        for entry in entries:
            name = entry["path"]
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or path.parts[0] != "Scweet":
                raise SourcePinMismatch("manifest.path")
            location = root / name
            if location.is_symlink() or not location.resolve().is_relative_to(root.resolve()):
                raise SourcePinMismatch("manifest.path")
            data = location.read_bytes()
            if name in sources or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise SourcePinMismatch(name)
            sources[name] = data
        return MappingProxyType(sources)
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise SourcePinMismatch("required SDK source") from error


def _execute(nodes: list[ast.stmt], namespace: dict[str, Any]) -> None:
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    tree = ast.fix_missing_locations(ast.Module(body=[future, *nodes], type_ignores=[]))
    exec(compile(tree, "<pinned-pure-sdk-builders>", "exec"), namespace)


class PinnedSdkBuilders:
    """Explicitly constructed offline capability, with no runtime registration."""

    def __init__(self, source_root: Path):
        sources = verified_sources(source_root)
        namespace = {"Any": Any, "Optional": Optional, "re": re, "json": json,
                     "datetime": datetime, "timedelta": timedelta,
                     "_TS_FMT": "%Y-%m-%d_%H:%M:%S_UTC"}
        query = ast.parse(sources["Scweet/query.py"])
        nodes = [node for node in query.body if
                 isinstance(node, ast.FunctionDef) and node.name in QUERY_FUNCTIONS or
                 isinstance(node, ast.Assign) and all(
                     isinstance(target, ast.Name) and target.id in QUERY_CONSTANTS
                     for target in node.targets)]
        if {node.name for node in nodes if isinstance(node, ast.FunctionDef)} != QUERY_FUNCTIONS:
            raise SourcePinMismatch("query.builders")
        scheduler = ast.parse(sources["Scweet/scheduler.py"])
        nodes += [node for node in scheduler.body if
                  isinstance(node, ast.FunctionDef) and node.name == "split_time_intervals"]
        api = ast.parse(sources["Scweet/api_engine.py"])
        nodes += [node for node in api.body if isinstance(node, ast.FunctionDef) and node.name == "_cfg"]
        engine = next(node for node in api.body if isinstance(node, ast.ClassDef) and node.name == "ApiEngine")
        methods = [node for node in engine.body if isinstance(node, ast.FunctionDef) and node.name in API_METHODS]
        if {node.name for node in methods} != API_METHODS:
            raise SourcePinMismatch("api.builders")
        nodes.append(ast.ClassDef(name="PureApiBuilders", bases=[], keywords=[], body=methods, decorator_list=[]))
        _execute(nodes, namespace)
        self.sources = sources
        self.split_intervals = namespace["split_time_intervals"]
        self.normalize = namespace["normalize_search_input"]
        self.raw_query = namespace["build_effective_search_query"]
        self.has_overriding_operators = lambda query: any(
            namespace["_query_has_operator"](query, name) for name in ("lang", "since", "until")
        ) or namespace["_query_has_any_min_operator"](query) or namespace["_query_has_any_filter_operator"](query)
        self._api_type = namespace["PureApiBuilders"]

    def api(self, page_size: int):
        instance = self._api_type()
        instance.config = {"api_page_size": page_size}
        return instance
