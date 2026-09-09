"""Scan allocation bounds before materializing JSON; reject ambiguous objects."""
import json
from dataclasses import dataclass
import re

from .failures import ObservationFailure

BODY_LIMIT = 2 * 1024 * 1024
NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", re.ASCII)


@dataclass(frozen=True)
class LargeJsonInteger:
    decimal: str


def _integer(token):
    # Avoid Python's global int-string limit or quadratic giant-int conversion.
    # Keep unusually large JSON integer lexemes lossless only for the raw mapper.
    return LargeJsonInteger(token) if len(token) > 1000 else int(token)


def parse_json(body: bytes, check=lambda: None, *, max_bytes=BODY_LIMIT, max_nodes=20000):
    if len(body) > max_bytes:
        raise ObservationFailure("BODY_LIMIT")
    try:
        text = body.decode("utf-8", errors="strict")
        depth = nodes = index = 0
        while index < len(text):
            if index % 1024 == 0:
                check()
            char = text[index]
            if char.isspace() or char in ",:":
                index += 1
                continue
            if char in "[{":
                depth += 1
                nodes += 1
                if depth > 32:
                    raise ObservationFailure("SCHEMA_INVALID")
                index += 1
            elif char in "]}":
                depth -= 1
                if depth < 0:
                    raise ObservationFailure("SCHEMA_INVALID")
                index += 1
            elif char == '"':
                nodes += 1  # Count keys too; a stricter allocation ceiling.
                index += 1
                while index < len(text):
                    if index % 1024 == 0:
                        check()
                    if text[index] == '"':
                        index += 1
                        break
                    if text[index] == "\\":
                        index += 2
                    else:
                        index += 1
                else:
                    raise ObservationFailure("SCHEMA_INVALID")
            else:
                nodes += 1
                match = NUMBER.match(text, index)
                if match:
                    index = match.end()
                else:
                    literal = next((v for v in ("true", "false", "null")
                                    if text.startswith(v, index)), None)
                    if literal is None:
                        raise ObservationFailure("SCHEMA_INVALID")
                    index += len(literal)
            if nodes > max_nodes:
                raise ObservationFailure("SCHEMA_INVALID")
        if depth != 0:
            raise ObservationFailure("SCHEMA_INVALID")
        check()
        value = json.loads(text, object_pairs_hook=_unique,
                           parse_constant=_invalid_constant, parse_int=_integer)
        check()
        return value
    except (UnicodeError, ValueError, RecursionError):
        raise ObservationFailure("SCHEMA_INVALID") from None


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ObservationFailure("SCHEMA_INVALID")
        result[key] = value
    return result


def _invalid_constant(_):
    raise ObservationFailure("SCHEMA_INVALID")
