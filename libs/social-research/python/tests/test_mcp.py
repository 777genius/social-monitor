import unittest
from pathlib import Path
from typing import Any, Mapping

from social_monitor_social_research.mcp import (
    SocialResearchMcpAdapter,
    load_contract_tools,
    tool_dispatch,
)


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Mapping[str, Any]]] = []

    def search_social(self, args: Mapping[str, Any]) -> dict[str, Any]:
        self.calls.append(("search_social", args))
        return {"items": []}

    def explain_search_plan(self, args: Mapping[str, Any]) -> dict[str, Any]:
        self.calls.append(("explain_search_plan", args))
        return {"plan": {"lanes": []}, "explanation": "ok"}

    def fetch_thread(self, args: Mapping[str, Any]) -> dict[str, Any]:
        self.calls.append(("fetch_thread", args))
        return {"root": {"itemId": "thread"}}

    def rank_results(self, args: Mapping[str, Any]) -> list[Any]:
        self.calls.append(("rank_results", args))
        return []

    def list_sources(self, args: Mapping[str, Any]) -> list[Any]:
        self.calls.append(("list_social_sources", args))
        return [{"sourceKey": "reddit"}]

    def explain_source_readiness(self, args: Mapping[str, Any]) -> dict[str, Any]:
        self.calls.append(("explain_source_readiness", args))
        return {"source": {"sourceKey": args["sourceKey"]}, "canPlan": True}


class SocialResearchMcpAdapterTest(unittest.TestCase):
    def test_lists_contract_tools(self) -> None:
        adapter = SocialResearchMcpAdapter(
            FakeClient(),
            load_contract_tools(contract_path()),
        )

        result = adapter.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})

        self.assertEqual(
            [tool["name"] for tool in result["result"]["tools"]],
            [
                "search_social",
                "explain_search_plan",
                "fetch_thread",
                "rank_results",
                "list_social_sources",
                "explain_source_readiness",
            ],
        )
        self.assertEqual(result["result"]["tools"][0]["inputSchema"]["type"], "object")

    def test_dispatch_covers_every_contract_tool(self) -> None:
        tools = load_contract_tools(contract_path())
        dispatch = tool_dispatch(FakeClient())

        self.assertEqual(
            sorted(dispatch.keys()),
            sorted(tool.name for tool in tools),
        )

    def test_calls_all_contract_tools_through_client(self) -> None:
        client = FakeClient()
        adapter = SocialResearchMcpAdapter(client, load_contract_tools(contract_path()))

        for index, (tool_name, arguments) in enumerate(contract_tool_calls(), start=2):
            result = adapter.handle(
                {
                    "jsonrpc": "2.0",
                    "id": index,
                    "method": "tools/call",
                    "params": {"name": tool_name, "arguments": arguments},
                }
            )

            self.assertEqual(result["jsonrpc"], "2.0")
            self.assertIn("content", result["result"])

        self.assertEqual(
            [name for name, _arguments in client.calls],
            [
                "search_social",
                "explain_search_plan",
                "fetch_thread",
                "rank_results",
                "list_social_sources",
                "explain_source_readiness",
            ],
        )


def contract_path() -> Path:
    return (
        Path(__file__).resolve().parents[4]
        / "libs/contracts/social-research/social-research.contract.json"
    )


def contract_tool_calls() -> list[tuple[str, Mapping[str, Any]]]:
    return [
        ("search_social", {"topic": "AI agents", "sources": ["reddit"]}),
        ("explain_search_plan", {"topic": "AI agents", "sources": ["reddit"]}),
        (
            "fetch_thread",
            {"sourceKey": "reddit", "itemId": "reddit:t3_1"},
        ),
        (
            "rank_results",
            {"intent": {"topic": "AI agents"}, "items": []},
        ),
        ("list_social_sources", {}),
        ("explain_source_readiness", {"sourceKey": "x-twitter"}),
    ]


if __name__ == "__main__":
    unittest.main()
