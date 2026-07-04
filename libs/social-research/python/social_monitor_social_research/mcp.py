from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, TextIO

from .client import SocialResearchClient, SocialResearchClientConfig

JsonDict = dict[str, Any]


@dataclass(frozen=True)
class SocialResearchMcpTool:
    name: str
    description: str
    input_schema: Mapping[str, Any]


class SocialResearchMcpAdapter:
    def __init__(
        self,
        client: SocialResearchClient,
        tools: Iterable[SocialResearchMcpTool],
    ):
        self._client = client
        self._tools = list(tools)
        self._tool_by_name = {tool.name: tool for tool in self._tools}

    def handle(self, message: Mapping[str, Any]) -> JsonDict | None:
        method = message.get("method")
        request_id = message.get("id")

        try:
            if method == "initialize":
                return response(request_id, initialize_result())
            if method == "tools/list":
                return response(request_id, {"tools": [tool_result(tool) for tool in self._tools]})
            if method == "tools/call":
                return response(request_id, self._call_tool(message.get("params")))
            if request_id is None:
                return None
            return error_response(request_id, -32601, f"Unsupported MCP method: {method}")
        except Exception as exc:
            if request_id is None:
                return None
            return error_response(request_id, -32000, str(exc))

    def _call_tool(self, params: Any) -> JsonDict:
        if not isinstance(params, Mapping):
            raise ValueError("tools/call params must be an object")
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(name, str) or name not in self._tool_by_name:
            raise ValueError(f"Unknown social research MCP tool: {name}")
        if not isinstance(arguments, Mapping):
            raise ValueError("tools/call arguments must be an object")

        result = tool_dispatch(self._client)[name](arguments)
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, indent=2, sort_keys=True),
                }
            ]
        }


def load_contract_tools(contract_path: Path) -> list[SocialResearchMcpTool]:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    tools = contract.get("tools")
    if not isinstance(tools, list):
        raise ValueError("social research contract must contain a tools array")
    return [
        SocialResearchMcpTool(
            name=str(tool["name"]),
            description=str(tool["description"]),
            input_schema=dict(tool.get("inputSchema") or {}),
        )
        for tool in tools
        if isinstance(tool, Mapping)
    ]


def run_stdio(
    adapter: SocialResearchMcpAdapter,
    stdin: TextIO = sys.stdin,
    stdout: TextIO = sys.stdout,
) -> None:
    for line in stdin:
        if len(line.strip()) == 0:
            continue
        message = json.loads(line)
        result = adapter.handle(message)
        if result is not None:
            stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
            stdout.flush()


def tool_dispatch(client: SocialResearchClient) -> dict[str, Callable[[Mapping[str, Any]], Any]]:
    return {
        "search_social": client.search_social,
        "explain_search_plan": client.explain_search_plan,
        "fetch_thread": client.fetch_thread,
        "rank_results": client.rank_results,
        "list_social_sources": lambda args: {"sources": client.list_sources(args)},
        "explain_source_readiness": client.explain_source_readiness,
    }


def tool_result(tool: SocialResearchMcpTool) -> JsonDict:
    return {
        "name": tool.name,
        "description": tool.description,
        "inputSchema": dict(tool.input_schema),
    }


def initialize_result() -> JsonDict:
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": {
            "name": "social-monitor-social-research-python",
            "version": "0.1.0",
        },
    }


def response(request_id: Any, result: Mapping[str, Any]) -> JsonDict:
    return {"jsonrpc": "2.0", "id": request_id, "result": dict(result)}


def error_response(request_id: Any, code: int, message: str) -> JsonDict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Python social research MCP stdio adapter.")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--api-key")
    parser.add_argument("--workspace-role", default="viewer")
    parser.add_argument(
        "--contract",
        default="libs/contracts/social-research/social-research.contract.json",
    )
    return parser


def main(argv: list[str]) -> int:
    args = build_arg_parser().parse_args(argv)
    client = SocialResearchClient(
        SocialResearchClientConfig(
            base_url=args.base_url,
            tenant_id=args.tenant_id,
            workspace_id=args.workspace_id,
            api_key=args.api_key,
            workspace_role=args.workspace_role,
        )
    )
    run_stdio(SocialResearchMcpAdapter(client, load_contract_tools(Path(args.contract))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
