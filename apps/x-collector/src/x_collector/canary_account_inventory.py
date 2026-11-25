from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence


REQUIRED_ACCOUNT_COUNT = 4
EX_USAGE = 64
EX_CONFIG = 78
SCHEMA_VERSION = "x-production-account-canary.v1"
ACCOUNT_SET_REASON = "x_canary.account_set_not_exactly_four"
INVENTORY_UNAVAILABLE_REASON = "x_canary.account_inventory_unavailable"
USERNAME_KEYS = ("username", "screen_name", "handle", "account_name")
AUTH_TOKEN_KEYS = ("auth_token", "authToken", "token")
CSRF_TOKEN_KEYS = ("ct0", "csrf", "csrf_token")
COOKIE_CONTAINER_KEYS = ("cookies", "cookies_json", "cookie_jar", "cookieJar")


class InventoryArgumentError(ValueError):
    pass


class QuietArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        del message
        raise InventoryArgumentError("invalid arguments")


@dataclass(frozen=True)
class AccountEntry:
    identity: str
    credential_identity: str
    credential_sources: frozenset[str]
    payload: dict[str, Any]
    mapping_key: str | None = None


@dataclass(frozen=True)
class AccountInventory:
    entries: tuple[AccountEntry, ...]
    container_kind: str
    malformed: bool = False
    duplicate: bool = False

    @property
    def observed_count(self) -> int:
        if not self.entries:
            return 0
        parents = list(range(len(self.entries)))

        def root(index: int) -> int:
            while parents[index] != index:
                parents[index] = parents[parents[index]]
                index = parents[index]
            return index

        for left_index, left in enumerate(self.entries):
            for right_index in range(left_index):
                right = self.entries[right_index]
                if (
                    left.identity == right.identity
                    or left.credential_identity == right.credential_identity
                    or not left.credential_sources.isdisjoint(
                        right.credential_sources,
                    )
                ):
                    parents[root(left_index)] = root(right_index)
        return len({root(index) for index in range(len(self.entries))})

    @property
    def reason_code(self) -> str | None:
        if self.malformed:
            return INVENTORY_UNAVAILABLE_REASON
        if self.duplicate:
            return ACCOUNT_SET_REASON
        if self.observed_count != REQUIRED_ACCOUNT_COUNT:
            return ACCOUNT_SET_REASON
        return None

    @property
    def ready(self) -> bool:
        return self.reason_code is None


def blocked_output(reason_code: str, observed_count: int) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "blocked",
        "reasonCode": reason_code,
        "requiredAccountCount": REQUIRED_ACCOUNT_COUNT,
        "observedAccountCount": max(observed_count, 0),
        "collectionAttempted": False,
    }


def ready_output() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "ready",
        "reasonCode": "x_canary.account_set_ready",
        "requiredAccountCount": REQUIRED_ACCOUNT_COUNT,
        "observedAccountCount": REQUIRED_ACCOUNT_COUNT,
        "collectionAttempted": False,
    }


def load_account_inventory(cookies_file: Path) -> AccountInventory:
    try:
        raw = json.loads(cookies_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return AccountInventory((), "invalid", malformed=True)

    candidates, container_kind, malformed = account_candidates(raw)
    entries: list[AccountEntry] = []
    for mapping_key, payload in candidates:
        if not isinstance(payload, dict) or not has_usable_auth_material(payload):
            malformed = True
            continue
        credential_sources = credential_source_fingerprints(payload)
        credential_identity = combined_credential_identity(credential_sources)
        identity = account_identity(payload, mapping_key, credential_identity)
        if identity is None:
            malformed = True
            continue
        entries.append(
            AccountEntry(
                identity,
                credential_identity,
                credential_sources,
                payload,
                mapping_key,
            ),
        )

    provisional = AccountInventory(tuple(entries), container_kind)
    return AccountInventory(
        tuple(entries),
        container_kind,
        malformed=malformed,
        duplicate=provisional.observed_count != len(entries),
    )


def account_candidates(
    raw: Any,
) -> tuple[list[tuple[str | None, Any]], str, bool]:
    if isinstance(raw, list):
        return [(None, value) for value in raw], "list", False
    if not isinstance(raw, dict) or not raw:
        return [], "invalid", True
    if "accounts" in raw:
        accounts = raw.get("accounts")
        if not isinstance(accounts, list):
            return [], "accounts", True
        extra_keys = set(raw).difference({"accounts"})
        return (
            [(None, value) for value in accounts],
            "accounts",
            bool(extra_keys),
        )
    if has_usable_auth_material(raw):
        return [(None, raw)], "single", False
    if all(isinstance(value, dict) for value in raw.values()):
        return [(str(key), value) for key, value in raw.items()], "mapping", False
    return [], "invalid", True


def account_identity(
    payload: dict[str, Any],
    mapping_key: str | None,
    credential_identity: str,
) -> str | None:
    aliases: set[str] = set()
    for key in USERNAME_KEYS:
        if key not in payload:
            continue
        value = normalized_identity(payload[key])
        if value is None:
            return None
        aliases.add(value)
    if len(aliases) > 1:
        return None
    if aliases:
        return f"username:{next(iter(aliases))}"
    mapped = normalized_identity(mapping_key)
    if mapped is not None:
        return f"username:{mapped}"

    if not credential_identity:
        return None
    return f"credential:{credential_identity}"


def credential_source_fingerprints(payload: dict[str, Any]) -> frozenset[str]:
    fingerprints: set[str] = set()
    auth_token, csrf_token = usable_auth_material(payload)
    for kind, value in (("auth_token", auth_token), ("ct0", csrf_token)):
        if value is None:
            continue
        fingerprint = fingerprint_value(kind, value)
        if fingerprint is not None:
            fingerprints.add(fingerprint)
    return frozenset(fingerprints)


def fingerprint_value(kind: str, value: Any) -> str | None:
    try:
        encoded = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("utf-8")
    except (TypeError, ValueError):
        return None
    return hashlib.sha256(kind.encode("ascii") + b"\0" + encoded).hexdigest()


def auth_representation(
    auth_values: list[Any],
    csrf_values: list[Any],
) -> tuple[tuple[str, str] | None, bool]:
    if not auth_values and not csrf_values:
        return None, False
    if len(auth_values) != 1 or len(csrf_values) != 1:
        return None, True
    auth_token = normalized_credential(auth_values[0])
    csrf_token = normalized_credential(csrf_values[0])
    if auth_token is None or csrf_token is None:
        return None, True
    return (auth_token, csrf_token), False


def top_level_auth_representation(
    payload: dict[str, Any],
) -> tuple[tuple[str, str] | None, bool]:
    return auth_representation(
        [payload[key] for key in AUTH_TOKEN_KEYS if key in payload],
        [payload[key] for key in CSRF_TOKEN_KEYS if key in payload],
    )


def cookie_auth_representation(
    value: Any,
) -> tuple[tuple[str, str] | None, bool]:
    auth_names = {key.casefold() for key in AUTH_TOKEN_KEYS}
    csrf_names = {key.casefold() for key in CSRF_TOKEN_KEYS}
    auth_values: list[Any] = []
    csrf_values: list[Any] = []
    if isinstance(value, dict):
        for name, token in value.items():
            normalized_name = str(name).strip().casefold()
            if normalized_name in auth_names:
                auth_values.append(token)
            elif normalized_name in csrf_names:
                csrf_values.append(token)
    elif isinstance(value, list):
        for item in value:
            if not isinstance(item, dict):
                return None, True
            name = item.get("name")
            normalized_name = name.strip().casefold() if isinstance(name, str) else ""
            if normalized_name in auth_names:
                auth_values.append(item.get("value"))
            elif normalized_name in csrf_names:
                csrf_values.append(item.get("value"))
    else:
        return None, True

    representation, malformed = auth_representation(auth_values, csrf_values)
    if representation is None and not malformed and bool(value):
        return None, True
    return representation, malformed


def combined_credential_identity(fingerprints: frozenset[str]) -> str:
    if not fingerprints:
        return ""
    encoded = "\n".join(sorted(fingerprints)).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


def normalized_identity(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lstrip("@").casefold()
    if not normalized or len(normalized) > 64:
        return None
    if any(character.isspace() for character in normalized):
        return None
    return normalized


def has_usable_auth_material(payload: dict[str, Any]) -> bool:
    auth_token, csrf_token = usable_auth_material(payload)
    return auth_token is not None and csrf_token is not None


def usable_auth_material(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    representations: list[tuple[str, str]] = []
    top_level, malformed = top_level_auth_representation(payload)
    if malformed:
        return None, None
    if top_level is not None:
        representations.append(top_level)

    for key in COOKIE_CONTAINER_KEYS:
        if key not in payload:
            continue
        nested, malformed = cookie_auth_representation(payload[key])
        if malformed:
            return None, None
        if nested is not None:
            representations.append(nested)

    if len(representations) != 1:
        return None, None
    return representations[0]


def normalized_credential(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def write_single_account_files(inventory: AccountInventory, output_dir: Path) -> None:
    if not inventory.ready:
        raise ValueError("inventory is not ready")
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    for ordinal, entry in enumerate(inventory.entries, start=1):
        payload: Any
        if inventory.container_kind == "list":
            payload = [entry.payload]
        elif inventory.container_kind == "accounts":
            payload = {"accounts": [entry.payload]}
        elif inventory.container_kind == "mapping":
            assert entry.mapping_key is not None
            payload = {entry.mapping_key: entry.payload}
        else:
            payload = entry.payload
        destination = output_dir / f"account-{ordinal}.json"
        descriptor = os.open(
            destination,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, separators=(",", ":"), ensure_ascii=True)
            stream.write("\n")


def build_parser() -> QuietArgumentParser:
    parser = QuietArgumentParser(add_help=False)
    parser.add_argument("action", choices=("check", "prepare"))
    parser.add_argument("--cookies-file", required=True)
    parser.add_argument("--output-dir")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = build_parser().parse_args(argv)
    except InventoryArgumentError:
        emit_json(blocked_output("invalid_arguments", 0))
        return EX_USAGE

    inventory = load_account_inventory(Path(arguments.cookies_file))
    reason_code = inventory.reason_code
    if reason_code is not None:
        emit_json(blocked_output(reason_code, inventory.observed_count))
        return EX_CONFIG

    if arguments.action == "prepare":
        if not arguments.output_dir:
            emit_json(blocked_output("invalid_arguments", REQUIRED_ACCOUNT_COUNT))
            return EX_USAGE
        try:
            write_single_account_files(inventory, Path(arguments.output_dir))
        except (OSError, ValueError):
            emit_json(blocked_output("inventory_prepare_failed", REQUIRED_ACCOUNT_COUNT))
            return EX_CONFIG

    emit_json(ready_output())
    return 0


def emit_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    sys.stdout.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
