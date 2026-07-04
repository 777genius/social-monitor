#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse


JsonDict = dict[str, Any]


@dataclass(frozen=True)
class Paths:
    repo_root: Path
    suite: Path
    contract: Path
    sdk_cases: Path
    output: Path


class ConformanceFailure(Exception):
    pass


class ConformanceTransport:
    def __init__(self, contract: Mapping[str, Any], sdk_cases: Mapping[str, Any]):
        self.contract = contract
        self.sdk_cases = sdk_cases
        self.calls: list[JsonDict] = []
        self._case_by_request = {
            canonical_json(case["requestInput"]): case
            for case in sdk_cases["cases"]
            if case["kind"] in ("request_to_plan", "source_extension_request_to_plan")
        }
        self._rank_case = next(
            case for case in sdk_cases["cases"] if case["kind"] == "rank_results"
        )
        self._safe_failure_case = next(
            case for case in sdk_cases["cases"] if case["kind"] == "safe_failure"
        )

    def post_json(
        self,
        path: str,
        body: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> JsonDict:
        del headers, timeout
        route = urlparse(path).path
        body_dict = dict(body)
        self.calls.append({"path": route, "body": body_dict})

        if route == "/social-research/explain-plan":
            return self._explain_plan(body_dict)
        if route == "/social-research/search":
            return self._search(body_dict)
        if route == "/social-research/rank":
            return {"rankedItems": self._rank_case["expectedRankedItems"]}
        if route == "/social-research/sources/list":
            return {"sources": self._list_sources(body_dict)}
        if route == "/social-research/sources/readiness":
            return self._source_readiness(str(body_dict["sourceKey"]))
        if route == "/social-research/threads/fetch":
            return {
                "thread": {
                    "root": {"itemId": body_dict.get("itemId", "thread-root")},
                    "replies": [],
                }
            }
        raise ConformanceFailure(f"Unexpected Python SDK REST route: {route}")

    def _explain_plan(self, body: Mapping[str, Any]) -> JsonDict:
        case = self._case_by_request.get(canonical_json(body))
        if case is None:
            raise ConformanceFailure(f"No golden planner case for request: {body!r}")
        return {
            "plan": case["expectedPlan"],
            "explanation": case["expectedExplanation"],
        }

    def _search(self, body: Mapping[str, Any]) -> JsonDict:
        if canonical_json(body) == canonical_json(self._safe_failure_case["requestInput"]):
            from social_monitor_social_research import SocialResearchHttpError

            raise SocialResearchHttpError(
                400,
                self._safe_failure_case["expectedFailure"]["message"],
                failure=self._safe_failure_case["expectedFailure"],
            )

        case = self._case_by_request.get(canonical_json(body))
        return {
            "run": {
                "plan": None if case is None else case["expectedPlan"],
                "items": [],
                "warnings": [],
                "partial": False,
            }
        }

    def _list_sources(self, body: Mapping[str, Any]) -> list[Any]:
        source_keys = body.get("sourceKeys")
        sources = self.contract["sourceRegistry"]
        if not isinstance(source_keys, list):
            return list(sources)
        allowed = {str(source_key) for source_key in source_keys}
        return [
            source
            for source in sources
            if str(source.get("sourceKey", source["capabilityProfile"]["sourceKey"]))
            in allowed
        ]

    def _source_readiness(self, source_key: str) -> JsonDict:
        source = next(
            (
                entry
                for entry in self.contract["sourceRegistry"]
                if entry["capabilityProfile"]["sourceKey"] == source_key
            ),
            None,
        )
        if source is None:
            return {
                "source": None,
                "canPlan": False,
                "canExecuteWithDefaultPolicy": False,
                "summary": f"Social source is not registered: {source_key}.",
                "reasons": ["source_not_registered"],
                "warnings": [],
            }

        profile = source["capabilityProfile"]
        certification = source["certification"]
        readiness = profile["readiness"]
        can_plan = (
            certification["level"] != "rejected"
            and len(profile.get("supportedOperations", [])) > 0
        )
        runtime_ready = readiness.get("runtimeReadiness") in (
            "fixture_ready",
            "live_beta_ready",
        )
        can_execute = (
            can_plan
            and runtime_ready
            and source.get("runtimeAdapterPolicy") != "not_wired"
        )
        blockers = list(certification.get("liveBetaBlockers", []))
        return {
            "source": source,
            "canPlan": can_plan,
            "canExecuteWithDefaultPolicy": can_execute,
            "summary": (
                f"{profile['displayName']} can be planned."
                if can_plan
                else f"{profile['displayName']} cannot be planned."
            ),
            "reasons": [] if can_plan else ["source_not_plannable"],
            "warnings": blockers,
        }


def main(argv: list[str]) -> int:
    args = build_arg_parser().parse_args(argv)
    paths = resolve_paths(args)
    add_python_sdk_to_path(paths.repo_root)

    suite = read_json(paths.suite)
    contract = read_json(paths.contract)
    sdk_cases = read_json(paths.sdk_cases)
    report = build_report(suite=suite, contract=contract, sdk_cases=sdk_cases)

    if args.dry_run:
        print("Python social research SDK conformance dry-run passed.")
        return 0

    serialized = stable_json(report)
    if args.update:
        paths.output.parent.mkdir(parents=True, exist_ok=True)
        paths.output.write_text(serialized, encoding="utf-8")
        print(f"Updated {relative_to_repo(paths.output, paths.repo_root)}")
        return 0

    if not paths.output.exists():
        raise ConformanceFailure(
            f"Missing Python SDK conformance report: {paths.output}"
        )
    expected = paths.output.read_text(encoding="utf-8")
    if serialized != expected:
        raise ConformanceFailure(
            "Python SDK conformance report is stale. "
            "Run python3 scripts/social_research_python_sdk_conformance.py --update."
        )
    print("Python social research SDK conformance passed.")
    return 0


def build_report(
    *,
    suite: Mapping[str, Any],
    contract: Mapping[str, Any],
    sdk_cases: Mapping[str, Any],
) -> JsonDict:
    client, transport = build_client(contract=contract, sdk_cases=sdk_cases)
    operation_results = operation_results_for(suite=suite, client=client)
    case_results = case_results_for(
        suite=suite,
        sdk_cases=sdk_cases,
        client=client,
        transport=transport,
    )
    return {
        "schemaVersion": 1,
        "artifactId": "social-research.python-sdk-conformance-report.v1",
        "generatedFrom": [
            "scripts/social_research_python_sdk_conformance.py",
            "libs/social-research/python/pyproject.toml",
            "libs/social-research/python/social_monitor_social_research/client.py",
            "libs/social-research/python/social_monitor_social_research/builder.py",
            "libs/social-research/python/social_monitor_social_research/mcp.py",
            "libs/contracts/social-research/social-research.contract.json",
            "libs/contracts/social-research/social-research.sdk-cases.json",
            "libs/contracts/social-research/social-research.language-sdk-conformance-suite.json",
        ],
        "sourceOfTruth": "libs/social-research",
        "targetLanguage": "python",
        "suiteArtifact": "libs/contracts/social-research/social-research.language-sdk-conformance-suite.json",
        "summary": {
            "status": all_passed(operation_results + case_results),
            "operationChecks": count_results(operation_results),
            "caseChecks": count_results(case_results),
        },
        "operationResults": operation_results,
        "caseResults": case_results,
    }


def build_client(
    *,
    contract: Mapping[str, Any],
    sdk_cases: Mapping[str, Any],
) -> tuple[Any, ConformanceTransport]:
    from social_monitor_social_research import (
        SocialResearchClient,
        SocialResearchClientConfig,
    )

    transport = ConformanceTransport(contract=contract, sdk_cases=sdk_cases)
    client = SocialResearchClient(
        SocialResearchClientConfig(
            base_url="https://social-research-conformance.test",
            tenant_id="tenant-conformance",
            workspace_id="workspace-conformance",
        ),
        transport,
    )
    return client, transport


def operation_results_for(*, suite: Mapping[str, Any], client: Any) -> list[JsonDict]:
    results = []
    for operation in suite["operationChecks"]:
        operation_ok = callable(getattr(client, operation["operationId"], None))
        safe_operation_id = operation.get("safeOperationId")
        safe_ok = (
            True
            if safe_operation_id is None
            else callable(getattr(client, safe_operation_id, None))
        )
        result: JsonDict = {
            "operationId": operation["operationId"],
            "status": "passed" if operation_ok and safe_ok else "failed",
        }
        if safe_operation_id is not None:
            result["safeOperationId"] = safe_operation_id
        results.append(result)
    return results


def case_results_for(
    *,
    suite: Mapping[str, Any],
    sdk_cases: Mapping[str, Any],
    client: Any,
    transport: ConformanceTransport,
) -> list[JsonDict]:
    case_by_id = {case["caseId"]: case for case in sdk_cases["cases"]}
    results = []
    for suite_case in suite["caseChecks"]:
        sdk_case = case_by_id[suite_case["caseId"]]
        assertion_results = [
            {
                "assertion": assertion,
                "status": assertion_status(
                    assertion=assertion,
                    sdk_case=sdk_case,
                    client=client,
                    transport=transport,
                ),
            }
            for assertion in suite_case["expectedAssertions"]
        ]
        results.append(
            {
                "caseId": suite_case["caseId"],
                "executionMode": suite_case["executionMode"],
                "status": all_passed(assertion_results),
                "assertionResults": assertion_results,
            }
        )
    return results


def assertion_status(
    *,
    assertion: str,
    sdk_case: Mapping[str, Any],
    client: Any,
    transport: ConformanceTransport,
) -> str:
    try:
        if assertion == "request_input_normalizes_to_intent":
            before = len(transport.calls)
            result = client.createSearchPlanFromRequest(sdk_case["requestInput"])
            request_was_sent = transport.calls[before]["body"] == sdk_case["requestInput"]
            return passed(result.get("ok") is True and request_was_sent)

        if assertion == "planner_output_matches_expected_plan":
            result = client.createSearchPlanFromRequest(sdk_case["requestInput"])
            return passed(result["plan"] == sdk_case["expectedPlan"])

        if assertion == "explanation_matches_expected_text":
            explanation = client.explainSearchRequest(sdk_case["requestInput"])
            return passed(explanation == sdk_case["expectedExplanation"])

        if assertion == "ranked_items_match_expected_order_and_signals":
            ranked_items = client.rankResults(sdk_case["rankInput"])
            return passed(ranked_items == sdk_case["expectedRankedItems"])

        if assertion == "safe_method_returns_failure_envelope":
            result = client.trySearchRequest(sdk_case["requestInput"])
            return passed(
                result == {"ok": False, "error": sdk_case["expectedFailure"]}
            )

        if assertion == "extension_profile_and_lane_strategy_recipe_supported":
            extension = sdk_case["sourceExtensionContract"]
            return passed(
                extension["capabilityProfile"]["sourceKey"] == sdk_case["requestInput"]["sources"]
                and len(extension["laneStrategy"]["recipes"]) > 0
            )

        raise ConformanceFailure(f"Unsupported case assertion: {assertion}")
    except Exception:
        return "failed"


def count_results(results: list[Mapping[str, Any]]) -> JsonDict:
    passed_count = sum(1 for result in results if result["status"] == "passed")
    return {"passed": passed_count, "total": len(results)}


def all_passed(results: list[Mapping[str, Any]]) -> str:
    return "passed" if all(result["status"] == "passed" for result in results) else "failed"


def passed(condition: bool) -> str:
    return "passed" if condition else "failed"


def resolve_paths(args: argparse.Namespace) -> Paths:
    repo_root = Path(args.repo_root).resolve()
    return Paths(
        repo_root=repo_root,
        suite=resolve_path(repo_root, args.suite),
        contract=resolve_path(repo_root, args.contract),
        sdk_cases=resolve_path(repo_root, args.sdk_cases),
        output=resolve_path(repo_root, args.output),
    )


def add_python_sdk_to_path(repo_root: Path) -> None:
    sys.path.insert(0, str(repo_root / "libs/social-research/python"))


def read_json(path: Path) -> JsonDict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ConformanceFailure(f"Expected JSON object in {path}")
    return value


def stable_json(value: Mapping[str, Any]) -> str:
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


def canonical_json(value: Mapping[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def resolve_path(repo_root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else repo_root / path


def relative_to_repo(path: Path, repo_root: Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Check Python social research SDK conformance."
    )
    parser.add_argument("--repo-root", default=".")
    parser.add_argument(
        "--suite",
        default="libs/contracts/social-research/social-research.language-sdk-conformance-suite.json",
    )
    parser.add_argument(
        "--contract",
        default="libs/contracts/social-research/social-research.contract.json",
    )
    parser.add_argument(
        "--sdk-cases",
        default="libs/contracts/social-research/social-research.sdk-cases.json",
    )
    parser.add_argument(
        "--output",
        default="libs/contracts/social-research/social-research.python-sdk-conformance-report.json",
    )
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except ConformanceFailure as error:
        print(f"Python SDK conformance failed: {error}", file=sys.stderr)
        raise SystemExit(1)
