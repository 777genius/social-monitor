"""Bounded structural admission of fixed-root Compose inputs, never dependency discovery."""
import hashlib
from pathlib import Path
from contract import Denied, require

MAX_BYTES = 1024 * 1024
MAX_EVENTS = 20000
MAX_DEPTH = 64
PREFIX = 'tag:yaml.org,2002:'
TAGS = {PREFIX + name for name in ('map', 'seq', 'str', 'null', 'bool', 'int', 'float', 'merge')}


def fixed_roots(paths, private_digest):
    # Import only the installed pinned parser. Absence/version drift has no fallback.
    try:
        import yaml
    except ImportError:
        raise Denied('compose-parser-unavailable') from None
    require(yaml.__version__ == '6.0.3', 'compose-parser-version')
    require(0 < len(paths) <= 128, 'compose-input-count')
    for path in paths:
        before = private_digest(path)
        with Path(path).open('rb') as stream:
            data = stream.read(MAX_BYTES + 1)
        require(len(data) <= MAX_BYTES, 'compose-structure-limit')
        require('sha256:' + hashlib.sha256(data).hexdigest() == before
                and private_digest(path) == before, 'trusted-compose-changed')
        try:
            # Bound the parser before recursive composition; aliases are never expanded.
            depth = 0
            for count, event in enumerate(yaml.parse(data, Loader=yaml.SafeLoader), 1):
                require(count <= MAX_EVENTS, 'compose-structure-limit')
                if isinstance(event, (yaml.MappingStartEvent, yaml.SequenceStartEvent)):
                    depth += 1
                    require(depth <= MAX_DEPTH, 'compose-structure-limit')
                elif isinstance(event, (yaml.MappingEndEvent, yaml.SequenceEndEvent)):
                    depth -= 1
            root = yaml.compose(data, Loader=yaml.SafeLoader)
            require(isinstance(root, yaml.MappingNode), 'compose-structure-unsupported')
            seen, active = set(), set()

            def visit(node, level=0):
                require(level <= MAX_DEPTH, 'compose-structure-limit')
                ident = id(node)
                require(ident not in active, 'compose-structure-unsupported')
                if ident in seen:
                    return
                require(node.tag in TAGS, 'compose-structure-unsupported')
                active.add(ident)
                if isinstance(node, yaml.MappingNode):
                    keys = set()
                    for key, value in node.value:
                        require(isinstance(key, yaml.ScalarNode)
                                and key.tag in (PREFIX + 'str', PREFIX + 'merge'),
                                'compose-structure-unsupported')
                        require(key.value not in keys, 'compose-structure-ambiguous')
                        keys.add(key.value)
                        # Conservative at every mapping, including extension/merge anchors.
                        require(key.value not in ('include', 'extends'), 'compose-dependency-unsupported')
                        if key.tag == PREFIX + 'merge':
                            require(isinstance(value, yaml.MappingNode)
                                    or (isinstance(value, yaml.SequenceNode)
                                        and all(isinstance(v, yaml.MappingNode) for v in value.value)),
                                    'compose-structure-unsupported')
                        visit(value, level + 1)
                elif isinstance(node, yaml.SequenceNode):
                    for value in node.value:
                        visit(value, level + 1)
                active.remove(ident)
                seen.add(ident)

            visit(root)
        except (yaml.YAMLError, UnicodeError, RecursionError, ValueError):
            # Never expose source snippets, private values or parser exception text.
            raise Denied('compose-structure-invalid') from None
