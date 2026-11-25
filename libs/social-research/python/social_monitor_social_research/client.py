from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Mapping, Protocol
from urllib import error, request

JsonDict = dict[str, Any]


class SocialResearchTransport(Protocol):
    def post_json(
        self,
        path: str,
        body: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> JsonDict:
        ...


@dataclass(frozen=True)
class SocialResearchClientConfig:
    base_url: str
    tenant_id: str
    workspace_id: str
    api_key: str | None = None
    workspace_role: str | None = "viewer"
    timeout: float = 30.0
    max_retries: int = 0
    retry_backoff_seconds: float = 0.25
    retry_status_codes: tuple[int, ...] = (408, 429, 500, 502, 503, 504)


class SocialResearchError(Exception):
    def __init__(self, message: str, *, failure: Mapping[str, Any] | None = None):
        super().__init__(message)
        self.failure = dict(failure or {})


class SocialResearchConfigurationError(SocialResearchError):
    pass


class SocialResearchHttpError(SocialResearchError):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        failure: Mapping[str, Any] | None = None,
    ):
        super().__init__(message, failure=failure)
        self.status_code = status_code


class UrllibSocialResearchTransport:
    def post_json(
        self,
        path: str,
        body: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> JsonDict:
        payload = json.dumps(body).encode("utf-8")
        http_request = request.Request(
            path,
            data=payload,
            headers={**headers, "content-type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(http_request, timeout=timeout) as response:
                return decode_json_response(response.read())
        except error.HTTPError as http_error:
            failure = decode_json_response(http_error.read())
            raise SocialResearchHttpError(
                http_error.code,
                failure_message(failure) or http_error.reason,
                failure=failure,
            ) from http_error


class SocialResearchClient:
    def __init__(
        self,
        config: SocialResearchClientConfig,
        transport: SocialResearchTransport | None = None,
    ):
        self._config = config
        self._transport = transport or UrllibSocialResearchTransport()

    def search_social(self, request_input: Mapping[str, Any]) -> JsonDict:
        return self._post("/social-research/search", request_input)["run"]

    def search_request(self, request_input: Mapping[str, Any]) -> JsonDict:
        return self.search_social(request_input)

    def search(self, intent_input: Mapping[str, Any]) -> JsonDict:
        return self.search_social(intent_input)

    def try_search_request(self, request_input: Mapping[str, Any]) -> JsonDict:
        return safe_result(lambda: self.search_request(request_input))

    def try_search(self, intent_input: Mapping[str, Any]) -> JsonDict:
        return safe_result(lambda: self.search(intent_input))

    def explain_search_plan(self, request_input: Mapping[str, Any]) -> JsonDict:
        return self._post("/social-research/explain-plan", request_input)

    def explain_search_request(self, request_input: Mapping[str, Any]) -> str:
        return str(self.explain_search_plan(request_input)["explanation"])

    def create_search_plan_from_request(self, request_input: Mapping[str, Any]) -> JsonDict:
        return {"ok": True, "plan": self.explain_search_plan(request_input)["plan"]}

    def create_search_plan(self, intent_input: Mapping[str, Any]) -> JsonDict:
        return self.create_search_plan_from_request(intent_input)

    def try_explain_search_request(self, request_input: Mapping[str, Any]) -> JsonDict:
        return safe_result(lambda: self.explain_search_request(request_input))

    def try_explain_search_plan(self, intent_input: Mapping[str, Any]) -> JsonDict:
        return safe_result(lambda: self.explain_search_request(intent_input))

    def fetch_thread(self, request_input: Mapping[str, Any]) -> JsonDict:
        return self._post("/social-research/threads/fetch", request_input)["thread"]

    def try_fetch_thread(self, request_input: Mapping[str, Any]) -> JsonDict:
        return safe_result(lambda: self.fetch_thread(request_input))

    def rank_results(self, request_input: Mapping[str, Any]) -> list[Any]:
        return list(self._post("/social-research/rank", request_input)["rankedItems"])

    def try_rank_results(self, request_input: Mapping[str, Any]) -> JsonDict:
        return safe_result(lambda: self.rank_results(request_input))

    def list_sources(self, request_input: Mapping[str, Any] | None = None) -> list[Any]:
        return list(self._post("/social-research/sources/list", request_input or {})["sources"])

    def get_source_profile(self, request_input: Mapping[str, Any] | str) -> JsonDict:
        source_key = request_input if isinstance(request_input, str) else request_input["sourceKey"]
        sources = self.list_sources({"sourceKeys": [source_key]})
        if len(sources) == 0:
            raise SocialResearchError(
                f"Social source is not registered: {source_key}.",
                failure={
                    "code": "source_not_found",
                    "message": f"Social source is not registered: {source_key}.",
                    "details": [],
                },
            )
        return dict(sources[0])

    def try_get_source_profile(self, request_input: Mapping[str, Any] | str) -> JsonDict:
        return safe_result(lambda: self.get_source_profile(request_input))

    def explain_source_readiness(self, request_input: Mapping[str, Any] | str) -> JsonDict:
        source_key = request_input if isinstance(request_input, str) else request_input["sourceKey"]
        return self._post(
            "/social-research/sources/readiness",
            {"sourceKey": source_key},
        )

    def try_explain_source_readiness(self, request_input: Mapping[str, Any] | str) -> JsonDict:
        return safe_result(lambda: self.explain_source_readiness(request_input))

    searchSocial = search_social
    searchRequest = search_request
    trySearchRequest = try_search_request
    trySearch = try_search
    explainSearchPlan = explain_search_plan
    explainSearchRequest = explain_search_request
    createSearchPlanFromRequest = create_search_plan_from_request
    createSearchPlan = create_search_plan
    tryExplainSearchRequest = try_explain_search_request
    tryExplainSearchPlan = try_explain_search_plan
    fetchThread = fetch_thread
    tryFetchThread = try_fetch_thread
    rankResults = rank_results
    tryRankResults = try_rank_results
    listSources = list_sources
    getSourceProfile = get_source_profile
    tryGetSourceProfile = try_get_source_profile
    explainSourceReadiness = explain_source_readiness
    tryExplainSourceReadiness = try_explain_source_readiness

    def _post(self, path: str, body: Mapping[str, Any]) -> JsonDict:
        url = absolute_url(self._config.base_url, path)
        headers = request_headers(self._config)
        attempts = max(0, self._config.max_retries) + 1

        for attempt in range(attempts):
            try:
                return self._transport.post_json(
                    url,
                    body,
                    headers,
                    self._config.timeout,
                )
            except SocialResearchHttpError as http_error:
                if not should_retry_http_error(http_error, self._config, attempt):
                    raise
                sleep_before_retry(self._config, attempt)

        raise SocialResearchError("Social research request failed after retries.")


def request_headers(config: SocialResearchClientConfig) -> dict[str, str]:
    if len(config.tenant_id.strip()) == 0 or len(config.workspace_id.strip()) == 0:
        raise SocialResearchConfigurationError(
            "tenant_id and workspace_id are required for social research REST calls."
        )

    headers = {
        "x-tenant-id": config.tenant_id,
        "x-workspace-id": config.workspace_id,
    }
    if config.api_key is not None:
        headers["authorization"] = f"Bearer {config.api_key}"
    elif config.workspace_role is not None:
        headers["x-workspace-role"] = config.workspace_role
    return headers


def safe_result(operation: Any) -> JsonDict:
    try:
        return {"ok": True, "value": operation()}
    except SocialResearchError as sdk_error:
        return {
            "ok": False,
            "error": sdk_error.failure
            or {
                "code": "execution_failed",
                "message": str(sdk_error),
                "details": [],
            },
        }


def should_retry_http_error(
    error: SocialResearchHttpError,
    config: SocialResearchClientConfig,
    attempt: int,
) -> bool:
    return (
        attempt < max(0, config.max_retries)
        and error.status_code in config.retry_status_codes
    )


def sleep_before_retry(config: SocialResearchClientConfig, attempt: int) -> None:
    if config.retry_backoff_seconds <= 0:
        return
    time.sleep(config.retry_backoff_seconds * (2**attempt))


def absolute_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def decode_json_response(payload: bytes) -> JsonDict:
    if len(payload) == 0:
        return {}
    decoded = json.loads(payload.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise SocialResearchError("Social research response must be a JSON object.")
    return decoded


def failure_message(failure: Mapping[str, Any]) -> str | None:
    error_value = failure.get("error")
    if isinstance(error_value, Mapping):
        message = error_value.get("message")
        return str(message) if message is not None else None
    message = failure.get("message")
    return str(message) if message is not None else None
