import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runtimeTokenLines } from './diagnose-summary-model-original-ast.mjs';

const positions = text => [...runtimeTokenLines(text)].sort((a, b) => a - b);

test('erased types, comments, imports, exports and bare parameters do not count', () => {
  assert.deepEqual(positions([
    'import { x } from "./x";',
    'type Options = {',
    '  value: string;',
    '};',
    'interface Contract {',
    '  run(): void;',
    '}',
    'export { x };',
    'const run = (',
    '  value: Options,',
    '): string =>',
    '  value.value;',
    '// recordSignal();',
    '/*',
    'recordSignal();',
    '*/',
  ].join('\n')), [9, 12]);
});

test('mixed type/runtime syntax, runtime defaults and multiline prompt literals remain candidates', () => {
  assert.deepEqual(positions([
    'const run = (',
    '  value: string = getDefault(),',
    '): string => value.trim();',
    'const prompt = `first',
    'second',
    'third`;',
    'const result = run() as string;',
  ].join('\n')), [1, 2, 3, 4, 5, 6, 7]);
});

test('runtime extends is retained; implements and type parameters are erased', () => {
  assert.deepEqual(positions([
    'class Derived',
    '  extends makeBase<string>()',
    '  implements Contract {',
    '  method<T>(value: T) {',
    '    return value;',
    '  }',
    '}',
  ].join('\n')), [1, 2, 4, 5]);
});

test('parse failures cannot silently produce an incomplete screen', () => {
  assert.throws(() => runtimeTokenLines('const = ;'), /Cannot classify invalid source/u);
});

test('abstract classes may contain concrete runtime implementations', () => {
  assert.deepEqual(positions([
    'abstract class Base {',
    '  abstract read(): string;',
    '  concrete() {',
    '    return 42;',
    '  }',
    '}',
  ].join('\n')), [1, 3, 4]);
});
