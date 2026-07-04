import unittest
from typing import Any, Mapping

from social_monitor_social_research import (
    SocialResearchClient,
    SocialResearchClientConfig,
    SocialResearchHttpError,
    create_social_research_request_builder,
)


class RecordingTransport:
    def __init__(self, responses: Mapping[str, dict[str, Any]]):
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def post_json(
        self,
        path: str,
        body: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "path": path,
                "body": dict(body),
                "headers": dict(headers),
                "timeout": timeout,
            }
        )
        response = self.responses[path]
        if "raise" in response:
            raise response["raise"]
        return response


class SocialResearchClientTest(unittest.TestCase):
    def test_search_social_posts_to_rest_contract(self) -> None:
        transport = RecordingTransport(
            {
                "https://api.test/social-research/search": {
                    "run": {"items": [{"itemId": "reddit:t3_1"}]}
                }
            }
        )
        client = client_with(transport)

        result = client.search_social(
            {
                "topic": "AI agents MCP",
                "sources": ["reddit"],
                "execution": {"scanJobId": "scan-1"},
            }
        )

        self.assertEqual(result["items"][0]["itemId"], "reddit:t3_1")
        self.assertEqual(
            transport.calls[0],
            {
                "path": "https://api.test/social-research/search",
                "body": {
                    "topic": "AI agents MCP",
                    "sources": ["reddit"],
                    "execution": {"scanJobId": "scan-1"},
                },
                "headers": {
                    "x-tenant-id": "tenant-1",
                    "x-workspace-id": "workspace-1",
                    "x-workspace-role": "viewer",
                },
                "timeout": 30.0,
            },
        )

    def test_source_discovery_methods_use_rest_contract(self) -> None:
        transport = RecordingTransport(
            {
                "https://api.test/social-research/sources/list": {
                    "sources": [
                        {
                            "sourceKey": "reddit",
                            "displayName": "Reddit",
                        }
                    ]
                },
                "https://api.test/social-research/sources/readiness": {
                    "source": {"sourceKey": "x-twitter"},
                    "canPlan": True,
                    "canExecuteWithDefaultPolicy": False,
                    "summary": "X/Twitter is gated.",
                    "reasons": [],
                    "warnings": [],
                },
            }
        )
        client = client_with(transport)

        self.assertEqual(client.list_sources({"sourceKeys": ["reddit"]})[0]["sourceKey"], "reddit")
        self.assertEqual(client.get_source_profile("reddit")["displayName"], "Reddit")
        self.assertFalse(client.explain_source_readiness("x-twitter")["canExecuteWithDefaultPolicy"])

    def test_plan_thread_and_rank_methods_use_rest_contract(self) -> None:
        transport = RecordingTransport(
            {
                "https://api.test/social-research/explain-plan": {
                    "plan": {"lanes": []},
                    "explanation": "No provider calls.",
                },
                "https://api.test/social-research/threads/fetch": {
                    "thread": {"root": {"itemId": "reddit:t3_1"}, "replies": []}
                },
                "https://api.test/social-research/rank": {
                    "rankedItems": [{"itemId": "useful", "rank": 1}]
                },
            }
        )
        client = client_with(transport)

        self.assertEqual(
            client.explain_search_plan({"topic": "AI agents"})["explanation"],
            "No provider calls.",
        )
        self.assertEqual(
            client.create_search_plan_from_request({"topic": "AI agents"}),
            {"ok": True, "plan": {"lanes": []}},
        )
        self.assertEqual(
            client.fetch_thread({"sourceKey": "reddit", "itemId": "reddit:t3_1"})[
                "root"
            ]["itemId"],
            "reddit:t3_1",
        )
        self.assertEqual(
            client.rank_results({"intent": {"topic": "AI agents"}, "items": []})[0][
                "itemId"
            ],
            "useful",
        )
        self.assertEqual(
            [call["path"] for call in transport.calls],
            [
                "https://api.test/social-research/explain-plan",
                "https://api.test/social-research/explain-plan",
                "https://api.test/social-research/threads/fetch",
                "https://api.test/social-research/rank",
            ],
        )

    def test_safe_methods_return_contract_failure_envelope(self) -> None:
        failure = {
            "error": {
                "code": "invalid_search_intent",
                "message": "Cannot execute an invalid social search intent.",
                "details": [{"code": "topic_required"}],
            }
        }
        transport = RecordingTransport(
            {
                "https://api.test/social-research/search": {
                    "raise": SocialResearchHttpError(
                        400,
                        "Cannot execute an invalid social search intent.",
                        failure=failure["error"],
                    )
                }
            }
        )
        client = client_with(transport)

        result = client.try_search_request({"topic": " "})

        self.assertEqual(
            result,
            {
                "ok": False,
                "error": failure["error"],
            },
        )

    def test_request_builder_outputs_plain_json_without_mutating(self) -> None:
        builder = create_social_research_request_builder("AI agents MCP")
        updated = (
            builder.preset("broad_research")
            .source("reddit")
            .account("@openai", source_key="x-twitter", include_mentions=True)
            .product("Claude Code")
            .keyword("MCP")
            .community("ClaudeAI", source_key="reddit", listings=["top"])
        )

        self.assertEqual(builder.build(), {"topic": "AI agents MCP"})
        self.assertEqual(
            updated.build(),
            {
                "topic": "AI agents MCP",
                "preset": "broad_research",
                "sources": ["reddit"],
                "accounts": [
                    {
                        "handle": "@openai",
                        "sourceKey": "x-twitter",
                        "includeMentions": True,
                    }
                ],
                "products": ["Claude Code"],
                "keywords": ["MCP"],
                "communities": [
                    {
                        "name": "ClaudeAI",
                        "sourceKey": "reddit",
                        "listings": ["top"],
                    }
                ],
            },
        )

    def test_retry_policy_is_explicit_for_transient_http_failures(self) -> None:
        transport = SequentialTransport(
            [
                {
                    "raise": SocialResearchHttpError(
                        503,
                        "Service unavailable.",
                        failure={
                            "code": "temporary_unavailable",
                            "message": "Service unavailable.",
                            "details": [],
                        },
                    )
                },
                {"run": {"items": [{"itemId": "reddit:t3_retry"}]}},
            ]
        )
        client = SocialResearchClient(
            SocialResearchClientConfig(
                base_url="https://api.test",
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                max_retries=1,
                retry_backoff_seconds=0,
            ),
            transport,
        )

        result = client.search_social({"topic": "AI agents"})

        self.assertEqual(result["items"][0]["itemId"], "reddit:t3_retry")
        self.assertEqual(len(transport.calls), 2)


def client_with(transport: RecordingTransport) -> SocialResearchClient:
    return SocialResearchClient(
        SocialResearchClientConfig(
            base_url="https://api.test",
            tenant_id="tenant-1",
            workspace_id="workspace-1",
        ),
        transport,
    )


class SequentialTransport:
    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def post_json(
        self,
        path: str,
        body: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "path": path,
                "body": dict(body),
                "headers": dict(headers),
                "timeout": timeout,
            }
        )
        response = self.responses.pop(0)
        if "raise" in response:
            raise response["raise"]
        return response


if __name__ == "__main__":
    unittest.main()
