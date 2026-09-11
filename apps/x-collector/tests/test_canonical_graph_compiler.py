"""Offline source parity and proposal tests; no SDK/native qualification."""
import copy
import builtins
import hashlib
import json
import sys
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from support.canonical_graph_support import SDK_ROOT, adapter_payload, lane, profile, sdk
from support.canonical_fixture_bootstrap import EVIDENCE, materialize_sdk
from x_collector.canonical_graph_compiler import (
    PublicManifest, ScalarRequest, compile_expansion, date_window_builder, read_request, semantic_hash,
)
from x_collector.canonical_sdk_builders import PinnedSdkBuilders, SourcePinMismatch


class CanonicalGraphCompilerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sdk = sdk()

    def test_offline_bootstrap_refuses_missing_corrupt_and_malicious_evidence(self):
        with tempfile.TemporaryDirectory() as temporary, patch(
                "x_collector.canonical_sdk_builders._execute",
                side_effect=AssertionError("executed before pins")):
            evidence = Path(temporary) / "sdk"
            with self.assertRaises(SourcePinMismatch):
                materialize_sdk(evidence)
            evidence.symlink_to(EVIDENCE, target_is_directory=True)
            with self.assertRaises(SourcePinMismatch):
                materialize_sdk(evidence)
            evidence.unlink()
            shutil.copytree(EVIDENCE, evidence)
            for original in sorted(EVIDENCE.rglob("*")):
                if not original.is_file():
                    continue
                target = evidence / original.relative_to(EVIDENCE)
                data = target.read_bytes()
                for corruption in (data + b"# corruption", b"__import__('sqlite3')"):
                    target.write_bytes(corruption)
                    with self.assertRaises(SourcePinMismatch, msg=str(target)):
                        materialize_sdk(evidence)
                target.unlink()
                with self.assertRaises(SourcePinMismatch, msg=str(target)):
                    materialize_sdk(evidence)
                target.symlink_to(original)
                with self.assertRaises(SourcePinMismatch, msg=str(target)):
                    materialize_sdk(evidence)
                target.unlink()
                target.write_bytes(data)
            for name in ("extra.txt", "Scweet/extra.py.txt"):
                target = evidence / name
                target.write_text("unexpected")
                with self.assertRaises(SourcePinMismatch):
                    materialize_sdk(evidence)
                target.unlink()
            extra = evidence / "unexpected-directory"
            extra.mkdir()
            with self.assertRaises(SourcePinMismatch):
                materialize_sdk(evidence)
            extra.rmdir()
            shutil.rmtree(evidence / "Scweet")
            (evidence / "Scweet").symlink_to(EVIDENCE / "Scweet", target_is_directory=True)
            with self.assertRaises(SourcePinMismatch):
                materialize_sdk(evidence)

    def test_plaintext_inventory_and_reviewed_license_provenance(self):
        fixtures = EVIDENCE.parent
        inventory = json.loads((fixtures / "inventory.json").read_bytes())
        self.assertEqual({e["path"] for e in inventory["sdkMembers"]},
                         {p.relative_to(fixtures).as_posix() for p in EVIDENCE.rglob("*") if p.is_file()})
        for entry in inventory["files"] + inventory["sdkMembers"]:
            data = (fixtures / entry["path"]).read_bytes()
            data.decode("utf8")
            self.assertEqual(len(data), entry["bytes"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry["sha256"])
            if "lines" in entry:
                self.assertEqual(len(data.splitlines()), entry["lines"])
        provenance_bytes = (fixtures / "scweet-license-provenance.json").read_bytes()
        self.assertEqual(hashlib.sha256(provenance_bytes).hexdigest(),
                         "1edd231b9f19154478bf99f618c8cd2e872d915e6b1115b363c35f9b775ab1c4")
        provenance = json.loads(provenance_bytes)
        sources = provenance["comparison"]["files"]
        self.assertEqual(len(sources), 30)
        self.assertEqual({e["path"] for e in sources}, set(self.sdk.sources))
        for entry in sources:
            data = (EVIDENCE / (entry["path"] + ".txt")).read_bytes()
            self.assertEqual(data, self.sdk.sources[entry["path"]])
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry["sha256"])
            self.assertTrue(entry["wheelEqual"] and entry["sdistEqual"])
        license_evidence = provenance["licenseEvidence"]
        self.assertEqual(hashlib.sha256((fixtures / license_evidence["file"]).read_bytes()).hexdigest(),
                         license_evidence["sha256"])

    def test_offline_bootstrap_is_fresh_and_checks_all_thirty_materialized_sources(self):
        with materialize_sdk() as first, materialize_sdk() as second:
            self.assertNotEqual(first, second)
            self.assertEqual(len(list(Path(first).rglob("*.py"))), 30)
            with patch("x_collector.canonical_sdk_builders._execute",
                       side_effect=AssertionError("executed before pins")):
                for name, data in self.sdk.sources.items():
                    target = Path(first) / name
                    target.write_bytes(data + b"# corruption")
                    with self.assertRaises(SourcePinMismatch, msg=name):
                        PinnedSdkBuilders(Path(first))
                    target.unlink()
                    with self.assertRaises(SourcePinMismatch, msg=name):
                        PinnedSdkBuilders(Path(first))
                    target.write_bytes(data)
            self.assertEqual(PinnedSdkBuilders(Path(second)).sources, self.sdk.sources)
        self.assertFalse(Path(first).exists())
        self.assertFalse(Path(second).exists())

    def test_success_ten_and_eleven_complete_lanes(self):
        for count in (10, 11):
            inputs = [lane(f"synthetic query {i}", i) for i in range(count)]
            result = compile_expansion(inputs, profile(), self.sdk)
            self.assertTrue(result["ok"], result)
            invocations = result["value"]["invocations"]
            streams = [s for i in invocations for p in i["passes"] for s in p["streams"]]
            self.assertEqual(len(streams), count * 15)
            self.assertEqual(len({s["streamId"] for s in streams}), count * 15)
            self.assertEqual(result, compile_expansion(copy.deepcopy(inputs), profile(), self.sdk))
            for index, invocation in enumerate(invocations):
                passes = invocation["passes"]
                self.assertEqual([p["label"] for p in passes], ["top_base", "top_strict", "latest_discovery"])
                self.assertEqual([(p["minLikes"], p["minRetweets"], p["minReplies"]) for p in passes],
                                 [(30, 0, 0), (90, 10, 5), (5, 0, 0)])
                for search_pass in passes:
                    self.assertEqual(search_pass["globalStopScope"], search_pass["passId"])
                    for stream in search_pass["streams"]:
                        variables = json.loads(stream["parametersWithoutCursor"]["variables"])
                        self.assertNotIn("cursor", variables)
                        self.assertEqual(variables["count"], 20)
                        minima = f" min_faves:{search_pass['minLikes']}"
                        if search_pass["minReplies"]:
                            minima += f" min_replies:{search_pass['minReplies']}"
                        if search_pass["minRetweets"]:
                            minima += f" min_retweets:{search_pass['minRetweets']}"
                        expected = (f"synthetic query {index} lang:en -filter:replies -filter:retweets" + minima +
                                    f" since:{stream['splitWindow']['since'][:-4]} until:{stream['splitWindow']['until'][:-4]}")
                        self.assertEqual(stream["rawQuery"], expected)
                        self.assertEqual(hashlib.sha256(stream["rawQuery"].encode()).hexdigest(), stream["rawQueryHash"])

    def test_actual_adapter_normalized_hash_and_parameters(self):
        from x_collector.search_plan import plan_scweet_search_passes
        value, configured = lane(), profile()
        graph = compile_expansion([value], configured, self.sdk)
        request = read_request(value["request"])
        for planned, desc in zip(plan_scweet_search_passes(request), graph["value"]["invocations"][0]["passes"]):
            for stream in desc["streams"]:
                payload = adapter_payload(request, planned, stream["splitWindow"])
                self.assertEqual(semantic_hash(self.sdk.normalize(payload)[0]), stream["normalizedRequestHash"])
                self.assertEqual(self.sdk.api(20)._build_graphql_params(
                    ScalarRequest(payload), None, PublicManifest(configured), runtime_hints={"page_size": 20}),
                    stream["parametersWithoutCursor"])

    def test_unicode_operators_use_actual_sdk_guard(self):
        for query in ("min_ı:1", "sİnce:2020-01-01", "mİN_İ:1", "ſince:x", "filter:linKs"):
            self.assertTrue(self.sdk.has_overriding_operators(query))
            result = compile_expansion([lane("synthetic " + query)], profile(), self.sdk)
            self.assertEqual(result["error"], {"code": "UNSUPPORTED_PROFILE", "path": "request.query.overridingOperators"})
        self.assertTrue(compile_expansion([lane("synthetic minimal 雪")], profile(), self.sdk)["ok"])

    def test_underflow_and_endpoint_templates_return_typed_errors(self):
        value = lane(); value["request"]["window_end"] = "0001-01-01T00:00:00Z"
        self.assertEqual(compile_expansion([value], profile(), self.sdk)["error"],
                         {"code": "INVALID_SCOPE_OR_WINDOW", "path": "request.window_end"})
        for suffix in ("{missing}", "{query_id.foo}", "{query_id[0]}", "{query_id!r}", "{query_id:>5}", "{"):
            configured = profile(); configured["endpoint"] += suffix
            configured["operationManifestHash"] = semantic_hash({k: configured[k] for k in
                ("queryId", "endpoint", "features", "fieldToggles")})
            configured["profileHash"] = semantic_hash({k: v for k, v in configured.items()
                if k not in ("profileHash", "operationManifestHash")})
            self.assertEqual(compile_expansion([lane()], configured, self.sdk)["error"],
                             {"code": "UNSUPPORTED_PROFILE", "path": "profile.endpoint"})

    def test_split_edges_exact_source_semantics(self):
        split = self.sdk.split_intervals
        start, end = "2026-09-05_00:00:00_UTC", "2026-09-05_23:59:59_UTC"
        windows = split(start, end, 5, 300)
        self.assertEqual([w[1][11:19] for w in windows],
                         ["04:47:59", "09:35:59", "14:23:59", "19:11:59", "23:59:59"])
        self.assertEqual(split(start, start, 5, 300), [(start, start)])
        self.assertEqual(split(end, start, 5, 300), [(end, start)])
        self.assertEqual(len(split(start, "2026-09-05_00:09:59_UTC", 5, 300)), 1)
        self.assertEqual(len(split(start, end, 24, 300)), 24)

    def test_calendar_midnight_and_nonmidnight(self):
        builder = date_window_builder()
        raw = lane()["request"]
        self.assertEqual(builder(read_request(raw)), ("2026-09-05", "2026-09-05"))
        raw["window_end"] = "2026-09-06T12:00:00Z"
        self.assertEqual(builder(read_request(raw)), ("2026-09-05", "2026-09-06"))

    def test_operators_unicode_compact_bytes_and_page_hint(self):
        payload = {"search_query": "雪 lang:ja min_faves:1 filter:links since:custom",
                   "lang": "en", "since": "2026-09-05_00:00:00_UTC", "until": "2026-09-05_23:59:59_UTC",
                   "display_type": "recent", "min_likes": 30, "min_replies": 5,
                   "min_retweets": 10, "tweet_type": "originals_only"}
        api = self.sdk.api(40)
        configured = profile()
        configured["fieldToggles"] = {"synthetic_toggle": False}
        params = api._build_graphql_params(ScalarRequest(payload), "fixture-cursor", PublicManifest(configured),
                                          runtime_hints={"page_size": 20})
        expected = {"rawQuery": "雪 lang:ja min_faves:1 filter:links since:custom until:2026-09-05_23:59:59",
                    "count": 20, "querySource": "typed_query", "product": "Latest",
                    "withGrokTranslatedBio": False, "cursor": "fixture-cursor"}
        self.assertEqual(params["variables"], json.dumps(expected, separators=(",", ":")))
        self.assertEqual(params["fieldToggles"], '{"synthetic_toggle":false}')
        for hint, expected_count in ((0, 40), (101, 100), (1, 1)):
            self.assertEqual(api._resolve_page_size(runtime_hints={"page_size": hint}), expected_count)

    def test_negative_inputs_and_source_pins_before_execution(self):
        for field, value in (("apiPageSize", 21), ("pageSizeHintSource", "unknown"), ("features", {"bad": 1})):
            invalid = profile()
            invalid[field] = value
            self.assertFalse(compile_expansion([lane()], invalid, self.sdk)["ok"])
        self.assertEqual(compile_expansion([lane(), lane()], profile(), self.sdk)["error"]["code"], "DUPLICATE_COORDINATE")
        invalid = lane()
        del invalid["request"]["query"]
        self.assertEqual(compile_expansion([invalid], profile(), self.sdk)["error"]["code"], "MISSING_INPUT")
        with tempfile.TemporaryDirectory() as temporary, patch(
                "x_collector.canonical_sdk_builders._execute", side_effect=AssertionError("executed before pins")):
            root = Path(temporary)
            (root / "manifest.json").write_bytes((SDK_ROOT / "manifest.json").read_bytes())
            with self.assertRaises(SourcePinMismatch):
                PinnedSdkBuilders(root)
            (root / "manifest.json").write_text("{}")
            with self.assertRaises(SourcePinMismatch):
                PinnedSdkBuilders(root)
            (root / "manifest.json").write_bytes((SDK_ROOT / "manifest.json").read_bytes())
            for name, data in self.sdk.sources.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data + (b"# tampered" if name == "Scweet/utils.py" else b""))
            with self.assertRaises(SourcePinMismatch):
                PinnedSdkBuilders(root)

    def test_global_stop_is_source_oracle_not_attempted_evidence(self):
        runner = self.sdk.sources["Scweet/runner.py"].decode()
        self.assertTrue("parsed.replace(hour=23, minute=59, second=59)" in runner)
        self.assertTrue("limit_reached_before_request = len(tweets_out) >= global_limit" in runner)
        self.assertTrue("stop_event.set()" in runner)
        self.assertNotIn("Scweet", sys.modules)
        self.assertNotIn("pydantic", sys.modules)
        graph = compile_expansion([lane()], profile(), self.sdk)
        self.assertNotIn('"executed"', json.dumps(graph))
        self.assertNotIn('"admitted"', json.dumps(graph))

    def test_all_product_threshold_branches_and_explicit_zero_presence(self):
        for products in ([], ["top"], ["latest"], ["latest", "top", "latest"]):
            for minima in ((None, None, None), (0, 0, 0), (30, 0, 0), (80, 20, 10)):
                value = lane()
                value["request"]["search_products"] = products
                value["request"].update(zip(("min_likes", "min_retweets", "min_replies"), minima))
                graph = compile_expansion([value], profile(), self.sdk)
                self.assertTrue(graph["ok"], graph)
                passes = graph["value"]["invocations"][0]["passes"]
                self.assertEqual([p["product"] for p in passes], ["top", "top", "latest"])
                expected = [minima, tuple(max(v * 3, floor) if v is not None else floor
                                         for v, floor in zip(minima, (50, 10, 5))),
                            tuple(min(v, ceiling) if v is not None else None
                                  for v, ceiling in zip(minima, (5, 1, 1)))]
                self.assertEqual([tuple(p[k] for k in ("minLikes", "minRetweets", "minReplies")) for p in passes], expected)

    def test_snapshot_ownership_and_closed_json_inputs(self):
        inputs, configured = [lane()], profile()
        original_query = inputs[0]["request"]["query"]
        original_api = self.sdk.api
        def mutate_after_snapshot(size):
            inputs[0]["request"]["query"] = "caller mutation"
            configured["features"]["synthetic_feature"] = False
            return original_api(size)
        with patch.object(self.sdk, "api", side_effect=mutate_after_snapshot):
            graph = compile_expansion(inputs, configured, self.sdk)
        self.assertTrue(graph["ok"], graph)
        invocation = graph["value"]["invocations"][0]
        self.assertEqual(invocation["request"]["query"], original_query)
        self.assertEqual(invocation["passes"][0]["streams"][0]["parametersWithoutCursor"]["features"], '{"synthetic_feature":true}')
        cyclic = []; cyclic.append(cyclic)
        for invalid in (cyclic, [float("nan")], [{"bad": object()}]):
            self.assertFalse(compile_expansion(invalid, profile(), self.sdk)["ok"])
        value = lane(); value["request"]["cursor"] = "synthetic-ignored-cursor"
        self.assertEqual(compile_expansion([value], profile(), self.sdk)["error"]["path"], "request.cursor")

    def test_import_tripwire_and_repository_pin_failure(self):
        original_import = builtins.__import__
        def guarded_import(name, *args, **kwargs):
            if name.split(".")[0] in ("Scweet", "pydantic", "requests", "httpx", "sqlite3"):
                raise AssertionError("forbidden runtime import")
            return original_import(name, *args, **kwargs)
        with patch("builtins.__import__", side_effect=guarded_import):
            self.assertTrue(compile_expansion([lane()], profile(), sdk())["ok"])
        with patch("x_collector.canonical_graph_compiler.REPOSITORY_PINS", {"search_plan.py": "0" * 64}):
            self.assertEqual(compile_expansion([lane()], profile(), self.sdk)["error"]["code"], "SOURCE_PIN_MISMATCH")

    def test_zero_minima_absent_manifest_flags_and_floor_limited_graph(self):
        configured = profile()
        configured.update(nSplits=24, minIntervalSeconds=50000, features=None, fieldToggles={})
        configured["operationManifestHash"] = semantic_hash({k: configured[k] for k in ("queryId", "endpoint", "features", "fieldToggles")})
        configured["profileHash"] = semantic_hash({k: v for k, v in configured.items() if k not in ("profileHash", "operationManifestHash")})
        value = lane(); value["request"].update(min_likes=0, min_retweets=0, min_replies=0)
        graph = compile_expansion([value], configured, self.sdk)
        self.assertTrue(graph["ok"], graph)
        first = graph["value"]["invocations"][0]["passes"][0]["streams"]
        self.assertEqual(len(first), 1)
        self.assertNotIn("min_faves", first[0]["rawQuery"])
        self.assertEqual(first[0]["parametersWithoutCursor"]["features"], "{}")
        self.assertNotIn("fieldToggles", first[0]["parametersWithoutCursor"])


if __name__ == "__main__":
    unittest.main()
