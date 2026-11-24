import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import {
  validateRunnerImplementationMarkers, artifactShapePolicyPath, duplicatePathsPolicyPath,
  redactionPolicyPath, handoffPolicyPath, displayPolicyPath, consistencyPolicyPath,
  readinessPolicyPath, valuePolicyPath, planPrinterPath, envFileLoaderPath, evidencePathAdmissionPath,
} from '../lib/external-beta-evidence-runner-markers.mjs';

const runnerFile = 'scripts/external-beta-evidence-runner.mjs';
const checkFile = 'scripts/check-external-beta-evidence-runner.mjs';
const selectionHelperPath = 'scripts/lib/external-beta-evidence-selections.mjs';
const sources = {
  runnerSource: readFileSync(runnerFile, 'utf8'),
  handoffSource: readFileSync(handoffPolicyPath, 'utf8'),
  displaySource: readFileSync(displayPolicyPath, 'utf8'),
  consistencyPolicySource: readFileSync(consistencyPolicyPath, 'utf8'),
  readinessPolicySource: readFileSync(readinessPolicyPath, 'utf8'),
  artifactShapePolicySource: readFileSync(artifactShapePolicyPath, 'utf8'),
  duplicatePathsPolicySource: readFileSync(duplicatePathsPolicyPath, 'utf8'),
  valuePolicySource: readFileSync(valuePolicyPath, 'utf8'),
  planPrinterSource: readFileSync(planPrinterPath, 'utf8'),
  envFileLoaderSource: readFileSync(envFileLoaderPath, 'utf8'),
  evidencePathAdmissionSource: readFileSync(evidencePathAdmissionPath, 'utf8'),
  checkSource: readFileSync(checkFile, 'utf8'),
  selectionHelperSource: readFileSync(selectionHelperPath, 'utf8'),
  redactionPolicySource: readFileSync(redactionPolicyPath, 'utf8'),
  runnerFile,
  checkFile,
  selectionHelperPath,
};

function assertPathAdmissionBinding(text) {
  const root = ts.createSourceFile(runnerFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(root.parseDiagnostics.length, 0);
  const factory = 'createExternalBetaEvidencePathAdmission';
  const imports = root.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === './lib/external-beta-evidence-path-admission.mjs');
  assert.equal(imports.length, 1);
  assert.deepStrictEqual(imports[0].importClause.namedBindings.elements.map(node => node.name.text), [factory]);
  const declarations = root.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]);
  const bindings = declarations.filter(node => node.initializer
    && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(root) === factory);
  assert.equal(bindings.length, 1, 'admission must bind once at top level, before env-file loading');
  const binding = bindings[0];
  assert.ok(ts.isObjectBindingPattern(binding.name));
  assert.deepStrictEqual(binding.name.elements.map(node => node.getText(root)), [
    'validateExternalBetaEnvFilePath', 'validateExecutableOutputArtifactPathEnv',
    'validatePlannedEvidencePathEnv', 'validateEvidencePathEnv',
    'evidencePathMaxBytes', 'formatBytes', 'isFixtureLikeArtifactPath',
  ]);
  assert.equal(binding.initializer.arguments.length, 1);
  const dependencies = binding.initializer.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(dependencies));
  assert.deepStrictEqual(dependencies.properties.map(node => node.getText(root)), [
    'contract', 'env: process.env', 'cwd: () => process.cwd()', 'jobInputEnvNames',
    'accessSync', 'existsSync', 'lstatSync', 'readFileSync', 'realpathSync', 'statSync',
    'execFileSync', 'writableMode: constants.W_OK',
  ]);
  const loader = declarations.find(node => node.initializer
    && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(root) === 'createExternalBetaEnvFileLoader');
  assert.ok(loader && loader.pos > binding.pos, 'path policy is ready before environment loading');
}

test('path admission binds the live dependencies at the actual CLI composition root', () => {
  assertPathAdmissionBinding(sources.runnerSource);
  const start = sources.runnerSource.indexOf('const {\n  validateExternalBetaEnvFilePath,');
  const end = sources.runnerSource.indexOf('\n});', start) + '\n});'.length;
  assert.ok(start >= 0 && end > start);
  const binding = sources.runnerSource.slice(start, end);
  for (const changed of [
    sources.runnerSource.replace(binding, '/* ' + binding + ' */'),
    sources.runnerSource.replace(binding, 'function dormantAdmission() {\n' + binding + '\n}'),
    sources.runnerSource.replace('env: process.env, cwd: () => process.cwd()', 'env: {}, cwd: () => process.cwd()'),
    sources.runnerSource.replace('./lib/external-beta-evidence-path-admission.mjs', './lib/wrong-owner.mjs'),
  ]) {
    assert.throws(() => assertPathAdmissionBinding(changed));
  }
});

test('path safety markers remain mandatory at the extracted implementation owner', () => {
  for (const marker of [
    'function validateExternalBetaEnvFilePath(', 'function validateExecutableOutputArtifactPathEnv(',
    'function validatePlannedEvidencePathEnv(', 'function validateEvidencePathEnv(',
    'lstatSync', 'isAbsentEvidencePath', 'isParentRelativePath',
    'realpath must not be inside the git workspace before live execution',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      evidencePathAdmissionSource: sources.evidencePathAdmissionSource.replaceAll(marker, 'removed-admission-marker'),
    });
    assert.ok(violations.includes(evidencePathAdmissionPath + ': evidence path admission must preserve "' + marker + '"'));
    assert.ok(violations.every(value => value.startsWith(evidencePathAdmissionPath)));
  }
  const missingOwner = validateRunnerImplementationMarkers({ ...sources, evidencePathAdmissionSource: '' });
  assert.ok(missingOwner.length >= 52, 'all relocated safety markers remain enforced');
  assert.match(sources.checkSource, /evidencePathAdmissionSource:\s*readFileSync\(evidencePathAdmissionPath,\s*'utf8'\)/);
});

test('runner cannot bypass the path-admission factory or any of its three safety stages', () => {
  for (const [before, after] of [
    ['env: process.env, cwd: () => process.cwd()', 'env: {}, cwd: () => process.cwd()'],
    ['  validateExecutableOutputArtifactPathEnv(job, new Set(missingEnv), violations);', '  // removed live path admission'],
    ['  validatePlannedEvidencePathEnv(job, missingEnvSet, violations);', '  // removed preflight path admission'],
    ['  const invalidPathEnv = validateEvidencePathEnv(job, missingEnvSet, violations);', '  const invalidPathEnv = new Set();'],
  ]) {
    assert.ok(sources.runnerSource.includes(before));
    const violations = validateRunnerImplementationMarkers({
      ...sources, runnerSource: sources.runnerSource.replace(before, after),
    });
    assert.ok(violations.some(value => value.startsWith(runnerFile + ': runner must ') && value.includes('evidence path admission')));
  }
});

test('every runner and checker implementation marker exists at its owning source', () => {
  assert.deepEqual(validateRunnerImplementationMarkers(sources), []);
});

test('a missing selection diagnostic fails closed at the extracted helper', () => {
  const violations = validateRunnerImplementationMarkers({
    ...sources,
    selectionHelperSource: sources.selectionHelperSource.replace(
      '--jobs requires at least one job id', 'missing-marker',
    ),
  });
  assert.deepEqual(violations, [
    `${selectionHelperPath}: selection helper must reject an empty --jobs list`,
  ]);
});

test('legacy runner and checker markers are still enforced', () => {
  const missingRunner = validateRunnerImplementationMarkers({
    ...sources,
    runnerSource: sources.runnerSource.replaceAll('unknownJobIds', 'missing-marker'),
  });
  assert.ok(missingRunner.some((message) => message.startsWith(`${runnerFile}:`)));
  const missingCheck = validateRunnerImplementationMarkers({
    ...sources,
    checkSource: sources.checkSource.replaceAll('strictSemanticNegativeSmokeLabels', 'missing-marker'),
  });
  assert.ok(missingCheck.some((message) => message.startsWith(`${checkFile}:`)));
});

test('extracted redaction policy markers are independently fail-closed', () => {
  const violations = validateRunnerImplementationMarkers({
    ...sources,
    redactionPolicySource: sources.redactionPolicySource.replaceAll(
      'forbiddenArtifactValueFragments', 'removed-redaction-marker',
    ),
  });
  assert.deepEqual(violations, [
    `${redactionPolicyPath}: extracted redaction policy must preserve "forbiddenArtifactValueFragments"`,
  ]);
});

test('relocated JSON handoff markers stay enforced at the actual module owner', () => {
  for (const marker of [
    'buildHandoff', 'buildHandoffArtifactContracts', 'buildHandoffInputs',
    'buildHandoffEnvArtifacts', 'requiredAlternativeInputs',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      handoffSource: sources.handoffSource.replaceAll(marker, 'removed-handoff-marker'),
    });
    assert.ok(violations.includes(
      `${handoffPolicyPath}: extracted JSON handoff must preserve "${marker}"`,
    ), `missing handoff module marker must reject: ${marker}`);
    assert.ok(violations.every((violation) => violation.startsWith(handoffPolicyPath)),
      'runner and unrelated policy ownership must stay untouched');
  }
});

test('relocated display markers are still enforced at their real owner', () => {
  for (const marker of [
    'formatOutputArtifacts', 'formatRequiredEnvAlternatives', 'formatHandoffArtifacts',
    'handoffAction', 'handoffRunner', 'artifactExamplePathByFormat', 'inputMetadataByEnv',
    'runnerDescription', 'operatorAction',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      displaySource: sources.displaySource.replaceAll(marker, 'removed-display-marker'),
    });
    assert.ok(violations.includes(
      `${displayPolicyPath}: extracted display formatters must preserve "${marker}"`,
    ), `missing display module marker must reject: ${marker}`);
    assert.ok(violations.every(v => v.startsWith(displayPolicyPath)),
      'unrelated source ownership must not be weakened');
  }
});

test('original checker reads display markers into its fail-closed source gate', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /displaySource:\s*readFileSync\(displayPolicyPath,\s*'utf8'\)/);
});

test('original checker reads the extracted handoff module into its fail-closed marker gate', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /handoffSource:\s*readFileSync\(handoffPolicyPath,\s*'utf8'\)/);
  assert.match(checkerSource, /validateRunnerImplementationMarkers\(/);
});

test('relocated artifact consistency and freshness markers are fail-closed at their real owner', () => {
  for (const marker of [
    'validateArtifactEnvConsistency', 'validateArtifactFreshness',
    'artifactFreshness', 'isIso8601Timestamp',
    'maxArtifactAgeHours', 'maxArtifactFutureSkewMinutes',
    'artifactEnvConsistencyRules', 'observedArtifactStringValues',
    'STAGING_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      consistencyPolicySource: sources.consistencyPolicySource.replaceAll(marker, 'missing-policy-marker'),
    });
    assert.ok(violations.includes(
      `${consistencyPolicyPath}: extracted artifact consistency/freshness policy must preserve "${marker}"`,
    ), `missing or disabled policy marker must fail closed: ${marker}`);
  }
});

test('real checker reads consistency and freshness policy from its authoritative module', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /consistencyPolicySource:\s*readFileSync\(consistencyPolicyPath,\s*'utf8'\)/);
});

test('extracted env readiness policy preserves every relocated fail-closed marker', () => {
  for (const marker of ["satisfiedRequiredEnvAlternatives","coversEnv","hasSatisfiedCapturedArtifactAlternative","captured_artifact","blocked_missing_required_env","blocked_invalid_env","blocked_local_runtime_env","live_artifact_ready_for_validation","hasOnlyLocalRuntimeEnvViolations"]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      readinessPolicySource: sources.readinessPolicySource.replaceAll(marker, 'removed-env-readiness-marker'),
    });
    assert.deepEqual(violations, [
      `${readinessPolicyPath}: extracted env readiness must preserve "${marker}"`,
    ], `missing readiness marker must fail closed without unrelated violations: ${marker}`);
  }
});

test('checker reads readiness markers from their authoritative module', () => {
  const checkSource = readFileSync(checkFile, 'utf8');
  assert.match(checkSource, /readinessPolicySource:\s*readFileSync\(readinessPolicyPath,\s*'utf8'\)/);
  const violations = validateRunnerImplementationMarkers({
    ...sources,
    readinessPolicySource: '',
  });
  assert.equal(violations.length, 9);
  assert.ok(violations.every(value => value.startsWith(readinessPolicyPath)));
});

test('relocated artifact identity/provider markers fail closed at their actual policy owner', () => {
  for (const marker of [
    'validateArtifactIdentity', 'expectedArtifactId', 'must use artifactId',
    'validateArtifactProviderKeys', 'expectedProviderKeys',
    'must include providerKey', 'must not include providerKey',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      artifactShapePolicySource: sources.artifactShapePolicySource.replaceAll(marker, 'removed-artifact-marker'),
    });
    assert.deepEqual(violations, [
      `${artifactShapePolicyPath}: extracted artifact shape policy must preserve "${marker}"`,
    ]);
  }
});


test('moved duplicate-path markers fail closed at their real implementation owner', () => {
  for (const marker of ['evidencePathEnvForbidsDuplicatePaths', 'evidencePathDuplicateKey',
    'must not duplicate another evidence artifact path in this run']) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      duplicatePathsPolicySource: sources.duplicatePathsPolicySource.replaceAll(marker, 'removed-duplicate-marker'),
    });
    assert.deepEqual(violations, [
      duplicatePathsPolicyPath + ': extracted duplicate evidence path policy must preserve "' + marker + '"',
    ]);
  }
});

test('checker reads duplicate-path module and rejects an empty policy implementation', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /duplicatePathsPolicySource:\s*readFileSync\(duplicatePathsPolicyPath,\s*'utf8'\)/);
  assert.equal(validateRunnerImplementationMarkers({
    ...sources, duplicatePathsPolicySource: '',
  }).filter(v => v.startsWith(duplicatePathsPolicyPath)).length, 3);
});

test('factory env binding and all three runner enforcement gates fail closed under mutation', () => {
  const binding = 'createExternalBetaDuplicateEvidencePaths({ contract, env: process.env });';
  const invocation = 'violations.push(...duplicateEvidencePathViolations(candidateJobs));';
  for (const candidate of [
    sources.runnerSource.replace(binding, 'createExternalBetaDuplicateEvidencePaths({ contract, env: {} });'),
    sources.runnerSource.replace(binding, '/* ' + binding + ' */'),
    sources.runnerSource.replace('} = ' + binding, '} = missingPolicy(); // } = ' + binding),
    sources.runnerSource.replace('import { createExternalBetaDuplicateEvidencePaths }',
      '// import { createExternalBetaDuplicateEvidencePaths }'),
  ]) {
    assert.ok(validateRunnerImplementationMarkers({ ...sources, runnerSource: candidate })
      .includes(runnerFile + ': runner must bind duplicate evidence path policy to live env'));
  }
  for (const candidate of [
    sources.runnerSource.replace(invocation, ''),
    sources.runnerSource.replace(invocation, '// ' + invocation),
    sources.runnerSource.replace(invocation, 'void 0; // ' + invocation),
  ]) {
    assert.ok(validateRunnerImplementationMarkers({ ...sources, runnerSource: candidate })
      .includes(runnerFile + ': runner must enforce duplicate evidence path policy in plan, validation and execution'));
  }
});

test('runner still invokes both extracted validators, not merely imports them', () => {
  for (const validator of ['validateArtifactIdentity', 'validateArtifactProviderKeys']) {
    const call = `${validator}(content, job, artifact, violations);`;
    const error = `${runnerFile}: runner must invoke ${validator} for each generated artifact`;
    assert.ok(sources.runnerSource.includes(call), `original live invocation of ${validator} must exist`);
    for (const replacement of ['', `// ${call}`, `/* ${call} */`]) {
      const violations = validateRunnerImplementationMarkers({
        ...sources,
        runnerSource: sources.runnerSource.replace(call, replacement),
      });
      assert.ok(violations.includes(error), `disabled invocation must fail closed: ${validator}`);
    }
  }
});

test('real checker reads the artifact shape policy for implementation marker enforcement', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /artifactShapePolicySource:\s*readFileSync\(artifactShapePolicyPath,\s*'utf8'\)/);
});

test('moved typed input markers fail closed at actual policy source', () => {
  for (const marker of [
    'criticalEnvValuesMustBeTyped', 'immutable sha256 image digest',
    'valid https URL', 'valid PostgreSQL URL', 'valid RabbitMQ URL',
    'validateTypedUrlEnv', 'validateHttpsEvidenceUrlEnv',
    'validateSecretTokenEnv', 'validateSecretReferenceEnv',
    'isPlaceholderSecretValue', 'isRawSecretValueReference',
    'realEvidenceIdentityEnvNames', 'isFixtureLikeEnvValue',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      valuePolicySource: sources.valuePolicySource.replaceAll(marker, 'removed-value-marker'),
    });
    assert.deepEqual(violations, [
      valuePolicyPath + ': extracted typed input policy must preserve "' + marker + '"',
    ]);
  }
  const checker = readFileSync(checkFile, 'utf8');
  assert.match(checker, /valuePolicySource:\s*readFileSync\(valuePolicyPath,\s*'utf8'\)/);
});

test('typed value policy must be bound to live env and invoked in every safety path', () => {
  const binding = 'createExternalBetaEvidenceValueValidator({ contract, env: process.env, jobInputEnvNames });';
  const invocation = 'validateEvidenceValueEnv(job, missingEnvSet, violations);';
  for (const candidate of [
    sources.runnerSource.replace(binding, 'createExternalBetaEvidenceValueValidator({ contract, env: {}, jobInputEnvNames });'),
    sources.runnerSource.replace(binding, '/* ' + binding + ' */'),
    sources.runnerSource.replace("import { localRuntimeEnvNames, isLocalRuntimeEnvValue, createExternalBetaEvidenceValueValidator }",
      "// import { localRuntimeEnvNames, isLocalRuntimeEnvValue, createExternalBetaEvidenceValueValidator }"),
  ]) {
    assert.ok(validateRunnerImplementationMarkers({ ...sources, runnerSource: candidate })
      .includes(runnerFile + ': runner must bind typed evidence value policy to live env and original job names'));
  }
  for (const candidate of [
    sources.runnerSource.replace(invocation, ''),
    sources.runnerSource.replace(invocation, '// ' + invocation),
    sources.runnerSource.replace(invocation, 'void 0; // ' + invocation),
  ]) {
    assert.ok(validateRunnerImplementationMarkers({ ...sources, runnerSource: candidate })
      .includes(runnerFile + ': runner must enforce typed evidence value validation in all three paths'));
  }
});

test('relocated plan printer markers fail closed at the actual formatter owner', () => {
  for (const name of [
    'function printPlan(plan)',
    'requiredEnvAlternatives:',
    'formatRequiredEnvAlternatives(job)',
    'formatOutputArtifacts(job)',
    'Missing required env count:',
    'Missing optional env count:',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      planPrinterSource: sources.planPrinterSource.replaceAll(name, 'removed-plan-printer-marker'),
    });
    assert.deepEqual(violations, [
      `${planPrinterPath}: extracted plan printer must preserve "${name}"`,
    ]);
  }
});

test('runner must bind and invoke extracted plan printer, not just import it', () => {
  const binding = 'const { printPlan } = createExternalBetaPlanPrinter({ contract, formatRequiredEnvAlternatives, formatOutputArtifacts });';
  const invocation = 'printPlan(plan);';
  for (const mutatedRunner of [
    sources.runnerSource.replace(binding, '// ' + binding),
    sources.runnerSource.replace(binding, 'const { printPlan } = createExternalBetaPlanPrinter({ contract, formatRequiredEnvAlternatives: () => "none", formatOutputArtifacts });'),
    sources.runnerSource.replace(invocation, '// ' + invocation),
    sources.runnerSource.replace("import { createExternalBetaPlanPrinter }", "// import { createExternalBetaPlanPrinter }"),
  ]) {
    assert.ok(validateRunnerImplementationMarkers({ ...sources, runnerSource: mutatedRunner })
      .includes(`${runnerFile}: runner must bind and invoke extracted plan printer`));
  }
});

test('real checker reads the extracted plan printer before accepting runner markers', () => {
  assert.match(sources.checkSource, /planPrinterSource:\s*readFileSync\(planPrinterPath,\s*'utf8'\)/);
});

test('relocated private env admission markers fail closed at their actual owner', () => {
  for (const name of [
    'function loadExternalBetaEnvFiles(paths)',
    'validateExternalBetaEnvFilePath(path, label, violations)',
    "parseDotenv(readFileSync(path, 'utf8'))",
    'EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell',
    'const existingValue = env[name]?.trim()',
    'conflicts with',
    'refusing to merge evidence from different runs',
    'env[name] = value',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      envFileLoaderSource: sources.envFileLoaderSource.replaceAll(name, 'missing-private-env-marker'),
    });
    assert.deepEqual(violations, [
      envFileLoaderPath + ': extracted private env-file admission must preserve "' + name + '"',
    ]);
  }
});

test('inline comments cannot spoof executable private env-file admission', () => {
  for (const [line, forged, marker] of [
    ['      validateExternalBetaEnvFilePath(path, label, violations);',
      '      void path; // validateExternalBetaEnvFilePath(path, label, violations)',
      'validateExternalBetaEnvFilePath(path, label, violations)'],
    ["      const parsed = parseDotenv(readFileSync(path, 'utf8'));",
      "      const parsed = {}; // parseDotenv(readFileSync(path, 'utf8'))",
      "parseDotenv(readFileSync(path, 'utf8'))"],
    ['        const existingValue = env[name]?.trim();',
      '        const existingValue = undefined; // const existingValue = env[name]?.trim()',
      'const existingValue = env[name]?.trim()'],
    ['        env[name] = value;',
      '        void value; // env[name] = value',
      'env[name] = value'],
  ]) {
    assert.ok(sources.envFileLoaderSource.includes(line), 'fixture must match live source: ' + marker);
    const tampered = sources.envFileLoaderSource.replace(line, forged);
    assert.ok(tampered.includes(marker), 'previous substring-only check would accept marker');
    assert.deepEqual(validateRunnerImplementationMarkers({
      ...sources, envFileLoaderSource: tampered,
    }), [
      envFileLoaderPath + ': extracted private env-file admission must preserve "' + marker + '"',
    ]);
  }
});

test('runner cannot bypass live private env admission by commenting out its binding', () => {
  for (const needle of [
    "import { createExternalBetaEnvFileLoader } from './lib/external-beta-evidence-env-file-loader.mjs';",
    'const { loadExternalBetaEnvFiles } = createExternalBetaEnvFileLoader({ parseDotenv, readFileSync, validateExternalBetaEnvFilePath, env: process.env });',
    'const envFileViolations = loadExternalBetaEnvFiles(envFileSelection.paths);',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources, runnerSource: sources.runnerSource.replace(needle, '// ' + needle),
    });
    assert.ok(violations.includes(runnerFile + ': runner must bind and invoke private env-file admission against live env'), needle);
  }
});

test('real checker reads the extracted private env-file policy for owner-marker enforcement', () => {
  assert.match(sources.checkSource, /envFileLoaderSource:\s*readFileSync\(envFileLoaderPath,\s*'utf8'\)/);
});
