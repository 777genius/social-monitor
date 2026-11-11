import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createExternalBetaDisplayFormatters } from './external-beta-evidence-display-formatters.mjs';

const originalSource = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const methods = [
  'formatOutputArtifacts', 'formatRequiredEnvAlternatives', 'formatHandoffArtifacts',
  'handoffAction', 'handoffRunner', 'artifactExamplePathByFormat', 'inputMetadataByEnv',
];

function fixture() {
  return createExternalBetaDisplayFormatters({
    contract: {
      artifactValidationCommand: 'npm run validate-evidence',
      artifactExamples: [{ format: 'json', path: '/safe/example.json' }],
    },
    inputMatrix: {
      inputClasses: [
        { inputClass: 'secret_ref', description: 'reference only', env: ['TOKEN'] },
        { inputClass: 'optional', description: 'optional input', env: ['OPTION'] },
      ],
    },
  });
}

test('factory is lazy and only wires its own display helpers', () => {
  const contract = new Proxy({}, { get: () => { throw new Error('unexpected read'); } });
  const inputMatrix = new Proxy({}, { get: () => { throw new Error('unexpected read'); } });
  assert.deepEqual(Object.keys(createExternalBetaDisplayFormatters({ contract, inputMatrix })), methods);
});

test('output artifact display preserves path and environment fallbacks', () => {
  assert.equal(fixture().formatOutputArtifacts({
    outputArtifacts: [{ format: 'json', path: '/safe/real.json' }, { format: 'text', env: 'ARTIFACT_PATH' }],
  }), '/safe/real.json (json), <env:ARTIFACT_PATH> (text)');
});

test('required alternative display preserves labels, covers and empty list', () => {
  const f = fixture().formatRequiredEnvAlternatives;
  assert.equal(f({}), 'none');
  assert.equal(f({ requiredEnvAlternatives: [
    { label: ' local ', env: ['LOCAL'], coversEnv: ['TOKEN'] },
    { env: ['ONE', 'TWO'] },
  ] }), ' local : LOCAL covers TOKEN | ONE + TWO');
});

test('handoff display preserves examples and unknown-format diagnostic', () => {
  const f = fixture().formatHandoffArtifacts;
  assert.equal(f({ outputArtifacts: [
    { format: 'json', env: 'ARTIFACT' }, { format: 'other', path: '/safe/custom' },
  ] }), '<env:ARTIFACT> (json; example: /safe/example.json), /safe/custom (other; no example registered)');
});

test('handoff actions preserve explicit action and three fallback policies', () => {
  const f = fixture().handoffAction;
  assert.equal(f({ operatorAction: ' operator run ' }), ' operator run ');
  assert.equal(f({ runPolicy: 'local_contract', validationCommands: ['check-a', 'check-b'] }),
    'run validators: check-a && check-b');
  assert.equal(f({ runPolicy: 'live_command', runnerCommand: 'npm run live', jobId: 'alpha' }),
    'set required env, run npm run live, then run npm run validate-evidence -- --job alpha');
  assert.equal(f({ jobId: 'beta' }),
    'collect real redacted artifact files, set artifact path env, then run npm run validate-evidence -- --job beta');
});

test('handoff runner keeps explicit description, commands and local/manual fallbacks', () => {
  const f = fixture().handoffRunner;
  assert.equal(f({ runnerDescription: ' operator step ' }), ' operator step ');
  assert.equal(f({ runnerCommand: 'npm run safe' }), 'npm run safe');
  assert.equal(f({ runnerCommand: null, runPolicy: 'local_contract' }), 'validators only');
  assert.equal(f({ runnerCommand: null }), 'manual evidence collection, then artifact validation');
});

test('input classes and artifact examples are rebuilt for every call', () => {
  const contract = { artifactExamples: [{ format: 'json', path: '/one' }] };
  const inputMatrix = { inputClasses: [{ inputClass: 'first', description: 'first', env: ['TOKEN'] }] };
  const f = createExternalBetaDisplayFormatters({ contract, inputMatrix });
  assert.equal(f.artifactExamplePathByFormat().get('json'), '/one');
  assert.deepEqual(f.inputMetadataByEnv().get('TOKEN'), { inputClass: 'first', description: 'first' });
  contract.artifactExamples[0].path = '/two';
  inputMatrix.inputClasses.push({ inputClass: 'last', description: 'last', env: ['TOKEN'] });
  assert.equal(f.artifactExamplePathByFormat().get('json'), '/two');
  assert.deepEqual(f.inputMetadataByEnv().get('TOKEN'), { inputClass: 'last', description: 'last' });
});

function assertDirectDelegation(source) {
  const ast = ts.createSourceFile('external-beta-evidence-runner.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const imports = ast.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === './lib/external-beta-evidence-display-formatters.mjs');
  assert.equal(imports.length, 1);
  assert.deepEqual(imports[0].importClause.namedBindings.elements.map(e => e.name.text),
    ['createExternalBetaDisplayFormatters']);
  const declarations = ast.statements.filter(ts.isVariableStatement)
    .flatMap(node => node.declarationList.declarations)
    .filter(node => node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(ast) === 'createExternalBetaDisplayFormatters');
  assert.equal(declarations.length, 1);
  const binding = declarations[0];
  assert.ok(ts.isObjectBindingPattern(binding.name));
  assert.deepEqual(binding.name.elements.map(e => e.name.getText(ast)), methods);
  assert.equal(binding.initializer.arguments.length, 1);
  assert.equal(binding.initializer.arguments[0].getText(ast), '{ contract, inputMatrix }');
  assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && methods.includes(node.name?.text)).length, 0);
}

test('original CLI has exactly one live top-level display factory delegation', () => {
  assertDirectDelegation(originalSource);
});

test('missing import, forged dependencies and dormant delegation fail closed', () => {
  const importStatement = "import { createExternalBetaDisplayFormatters } from './lib/external-beta-evidence-display-formatters.mjs';";
  const declaration = `const {
  formatOutputArtifacts, formatRequiredEnvAlternatives, formatHandoffArtifacts,
  handoffAction, handoffRunner, artifactExamplePathByFormat, inputMetadataByEnv,
} = createExternalBetaDisplayFormatters({ contract, inputMatrix });`;
  for (const mutant of [
    originalSource.replace(importStatement, ''),
    originalSource.replace('{ contract, inputMatrix });', '{ contract: {}, inputMatrix });'),
    originalSource.replace(declaration, 'if (false) {\\n' + declaration + '\\n}'),
    originalSource.replace(declaration, 'function dormantDisplaySetup() {\\n' + declaration + '\\n}'),
  ]) assert.throws(() => assertDirectDelegation(mutant));
});
