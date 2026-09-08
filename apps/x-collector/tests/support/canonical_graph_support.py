"""SYNTHETIC public inputs, never deployment or native model evidence."""
from pathlib import Path
import hashlib
import json

from x_collector.canonical_sdk_builders import PinnedSdkBuilders
from support.canonical_fixture_bootstrap import materialize_sdk


ROOT = Path(__file__).resolve().parents[4]
_SDK_DIRECTORY = materialize_sdk()
SDK_ROOT = Path(_SDK_DIRECTORY.name)


def sdk():
    return PinnedSdkBuilders(SDK_ROOT)


def profile():
    value = {"nSplits": 5, "minIntervalSeconds": 300, "apiPageSize": 20,
            "pageSizeHint": 20, "pageSizeHintSource": "runner-config",
            "maxEmptyPages": 2, "concurrency": 5, "profileHash": "a" * 64,
            "operationManifestHash": "b" * 64, "queryId": "synthetic-search",
            "endpoint": "https://fixture.invalid/graphql/{query_id}/SearchTimeline",
            "features": {"synthetic_feature": True}, "fieldToggles": None}
    digest = lambda payload: hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    value["operationManifestHash"] = digest({key: value[key] for key in ("queryId", "endpoint", "features", "fieldToggles")})
    value["profileHash"] = digest({key: item for key, item in value.items() if key not in ("profileHash", "operationManifestHash")})
    return value


def request(query="synthetic query"):
    return {"request_id": "synthetic-scan:1:1", "tenant_id": "synthetic-tenant",
            "workspace_id": "synthetic-workspace", "source_binding_id": "synthetic-binding",
            "scan_job_id": "synthetic-scan", "correlation_id": "synthetic-correlation",
            "query": query, "language": "en", "window_hours": 24,
            "window_end": "2026-09-06T00:00:00.000Z", "search_products": ["top"],
            "limit_per_product": 50, "max_items": 3,
            "min_likes": 30, "min_retweets": 0, "min_replies": 0, "cursor": None}


def lane(query="synthetic query", ordinal=0):
    raw = request(query)
    raw["request_id"] = f"synthetic-scan:{ordinal + 1}:1"
    return {"day": "2026-09-05", "laneOrdinal": ordinal, "request": raw}


def adapter_payload(request, search_pass, split_window):
    """Execute verified actual adapter argument construction with an inert recorder."""
    import ast
    from typing import Any, Mapping
    from x_collector.canonical_graph_compiler import REPOSITORY_PINS
    from x_collector.domain import DailySearchRequest, SearchProduct
    from x_collector.search_plan import ScweetSearchPass
    source = ROOT / 'apps/x-collector/src/x_collector/scweet_adapter.py'
    data = source.read_bytes()
    assert hashlib.sha256(data).hexdigest() == REPOSITORY_PINS['scweet_adapter.py']
    nodes = [n for n in ast.parse(data).body if isinstance(n, ast.FunctionDef)
             and n.name in {'scweet_display_type', 'run_scweet_search_pass'}]
    namespace = dict(Any=Any, Mapping=Mapping, DailySearchRequest=DailySearchRequest,
                     SearchProduct=SearchProduct, ScweetSearchPass=ScweetSearchPass)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<actual-adapter-builder>', 'exec'), namespace)
    class Capture:
        def search(self, query, **kwargs):
            self.query, self.kwargs = query, kwargs
            return []
    capture = Capture()
    namespace['run_scweet_search_pass'](capture, request=request, search_pass=search_pass,
                                      since='2026-09-05', until='2026-09-05')
    assert capture.kwargs['save'] is False and capture.kwargs['resume'] is False
    return {'search_query': capture.query, **{k: capture.kwargs[k] for k in
            ('lang', 'tweet_type', 'display_type', 'min_likes', 'min_retweets', 'min_replies')},
            **split_window}


def assert_expansion_builder_parity(expansion, configured):
    """Compare every descriptor to the pinned actual adapter and SDK pure builders."""
    from x_collector.canonical_graph_compiler import PublicManifest, ScalarRequest, read_request, semantic_hash
    from x_collector.search_plan import plan_scweet_search_passes
    builders = sdk()
    checked = 0
    for invocation in expansion['invocations']:
        request = read_request(invocation['request'])
        planned = plan_scweet_search_passes(request)
        assert len(planned) == len(invocation['passes'])
        for search_pass, descriptor in zip(planned, invocation['passes']):
            for stream in descriptor['streams']:
                payload = adapter_payload(request, search_pass, stream['splitWindow'])
                assert semantic_hash(builders.normalize(payload)[0]) == stream['normalizedRequestHash']
                parameters = builders.api(20)._build_graphql_params(
                    ScalarRequest(payload), None, PublicManifest(configured), runtime_hints={'page_size': 20})
                assert parameters == stream['parametersWithoutCursor']
                assert semantic_hash(parameters) == stream['parametersHash']
                assert json.loads(parameters['variables'])['rawQuery'] == stream['rawQuery']
                assert hashlib.sha256(stream['rawQuery'].encode()).hexdigest() == stream['rawQueryHash']
                checked += 1
    return checked
