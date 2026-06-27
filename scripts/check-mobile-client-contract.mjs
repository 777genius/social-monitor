import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const snapshotPath = 'libs/contracts/rest/openapi.snapshot.json';
const contractPath = 'libs/contracts/rest/generated/mobile-client.contract.json';
const clientPath = 'libs/contracts/rest/generated/mobile-api-client.ts';
const dartClientPath = 'libs/contracts/rest/generated/flutter/social_monitor_api_client.dart';
const update = process.argv.includes('--update');
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const allowedDevOnlyWorkspaceRoleOperations = new Set([
  'ApiKeysController_create',
  'ApiKeysController_list',
  'ApiKeysController_revoke',
  'PublicApiAuditEventsController_list',
  'ScanDeadLetterController_list',
]);
const frontendCriticalOperations = [
  {
    operationId: 'FeedController_list',
    requiredQueryParameters: [
      'cursor',
      'limit',
      'providerKey',
      'repositoryLanguage',
      'repositoryTopic',
      'repositoryTrendWindow',
      'topicId',
    ],
    requiredResponseSchemaRefs: ['#/components/schemas/ListFeedItemsResponseDto'],
  },
  {
    operationId: 'ReaderSummaryController_list',
    requiredQueryParameters: [
      'cursor',
      'freshnessStatus',
      'limit',
      'memoryGuidanceApplied',
      'providerKey',
      'scopeType',
      'subscriptionId',
      'topicId',
      'userId',
    ],
    requiredResponseSchemaRefs: ['#/components/schemas/ListReaderSummariesResponseDto'],
  },
  {
    operationId: 'ReaderSummaryController_get',
    requiredPathParameters: ['readerSummaryId'],
    requiredResponseSchemaRefs: ['#/components/schemas/ReaderSummaryResponseDto'],
  },
  {
    operationId: 'SourceBindingController_list',
    requiredPathParameters: ['topicId'],
    requiredQueryParameters: ['cursor', 'limit', 'providerKey', 'status'],
    requiredResponseSchemaRefs: ['#/components/schemas/ListSourceBindingsResponseDto'],
  },
  {
    operationId: 'SourceBindingController_overview',
    requiredPathParameters: ['topicId'],
    requiredQueryParameters: ['cursor', 'limit', 'providerKey', 'status'],
    requiredResponseSchemaRefs: ['#/components/schemas/ListSourceBindingOverviewResponseDto'],
  },
  {
    operationId: 'SourceBindingController_dailyHistory',
    requiredPathParameters: ['topicId'],
    requiredQueryParameters: ['days', 'providerKey'],
    requiredResponseSchemaRefs: ['#/components/schemas/ListTopicSourceDailyHistoryResponseDto'],
  },
  {
    operationId: 'ScanRequestController_list',
    requiredPathParameters: ['sourceBindingId'],
    requiredQueryParameters: ['cursor', 'limit', 'status'],
    requiredResponseSchemaRefs: ['#/components/schemas/ListScanRequestsResponseDto'],
  },
  {
    operationId: 'SummaryFeedbackController_list',
    requiredPathParameters: ['summaryId'],
    requiredQueryParameters: ['cursor', 'limit'],
    requiredResponseSchemaRefs: ['#/components/schemas/ListSummaryFeedbackResponseDto'],
  },
];

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const operations = extractOperations(snapshot);
const violations = validateOperations(operations);

const devOnlyWorkspaceRoleOperations = operations
  .filter((operation) => operation.devOnlyWorkspaceRoleRequired)
  .map((operation) => operation.operationId)
  .sort();
const mobileReadyOperations = operations
  .filter((operation) => !operation.devOnlyWorkspaceRoleRequired)
  .map((operation) => operation.operationId)
  .sort();
const unexpectedDevOnly = devOnlyWorkspaceRoleOperations
  .filter((operationId) => !allowedDevOnlyWorkspaceRoleOperations.has(operationId));

if (unexpectedDevOnly.length > 0) {
  violations.push(`Unexpected dev-only workspace role operations: ${unexpectedDevOnly.join(', ')}`);
}

const contract = {
  schemaVersion: 1,
  generatedBy: 'npm run check:mobile-client-contract',
  generatedFrom: snapshotPath,
  apiTitle: snapshot.info?.title ?? 'unknown',
  apiVersion: snapshot.info?.version ?? 'unknown',
  consumerTargets: ['flutter-dart'],
  generationMode: 'deterministic_openapi_operation_manifest',
  errorModel: problemDetailsErrorModel(),
  unknownValuePolicy: {
    enumStrings: 'preserve_raw_value_and_map_to_unknown_in_ui_layer',
    additionalJsonProperties: 'ignore_for_strong_models_preserve_in_raw_payload_when_available',
  },
  operationCount: operations.length,
  mobileReadyOperationCount: mobileReadyOperations.length,
  devOnlyWorkspaceRoleOperations,
  mobileReadyOperations,
  operations,
};
const serializedContract = `${JSON.stringify(contract, null, 2)}\n`;
const serializedClient = renderClient(operations);
const serializedDartClient = renderDartClient(operations);

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

if (update) {
  mkdirSync(dirname(contractPath), { recursive: true });
  mkdirSync(dirname(dartClientPath), { recursive: true });
  writeFileSync(contractPath, serializedContract);
  writeFileSync(clientPath, serializedClient);
  writeFileSync(dartClientPath, serializedDartClient);
  console.log(`Updated ${contractPath}`);
  console.log(`Updated ${clientPath}`);
  console.log(`Updated ${dartClientPath}`);
  process.exit(0);
}

for (const [path, expected] of [
  [contractPath, serializedContract],
  [clientPath, serializedClient],
  [dartClientPath, serializedDartClient],
]) {
  if (!existsSync(path)) {
    console.error(`${path} is missing. Run npm run check:mobile-client-contract -- --update`);
    process.exit(1);
  }

  const actual = readFileSync(path, 'utf8');
  if (actual !== expected) {
    console.error(`${path} is stale. Run npm run check:mobile-client-contract -- --update`);
    process.exit(1);
  }
}

console.log(`Mobile client contract OK (${operations.length} operations)`);

function extractOperations(openApi) {
  const usedClientNames = new Map();

  return Object.entries(openApi.paths ?? {})
    .flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => httpMethods.has(method))
        .map(([method, operation]) => normalizeOperation(path, method, operation, usedClientNames)),
    )
    .sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`));
}

function normalizeOperation(path, method, operation, usedClientNames) {
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  const headers = parameters.filter((parameter) => parameter.in === 'header');
  const requiredHeaders = headers
    .filter((parameter) => parameter.required === true)
    .map((parameter) => String(parameter.name).toLowerCase())
    .sort();
  const optionalHeaders = headers
    .filter((parameter) => parameter.required !== true)
    .map((parameter) => String(parameter.name).toLowerCase())
    .sort();
  const pathParameters = parameters
    .filter((parameter) => parameter.in === 'path')
    .map((parameter) => String(parameter.name))
    .sort();
  const queryParameters = parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => String(parameter.name))
    .sort();
  const operationId = String(operation.operationId ?? '');
  const supportsBearerApiKey = requiredHeaders.includes('authorization') || optionalHeaders.includes('authorization');
  const devOnlyWorkspaceRoleRequired = requiredHeaders.includes('x-workspace-role') && !supportsBearerApiKey;

  return {
    operationId,
    clientName: uniqueClientName(sanitizeOperationId(operationId), usedClientNames),
    method: method.toUpperCase(),
    path,
    tags: [...(operation.tags ?? [])].sort(),
    summary: operation.summary ?? '',
    pathParameters,
    queryParameters,
    requiredHeaders,
    optionalHeaders,
    requiresTenantWorkspace: requiredHeaders.includes('x-tenant-id') && requiredHeaders.includes('x-workspace-id'),
    supportsBearerApiKey,
    usesDevOnlyWorkspaceRoleHeader: requiredHeaders.includes('x-workspace-role') || optionalHeaders.includes('x-workspace-role'),
    devOnlyWorkspaceRoleRequired,
    requestBodySchemaRef: schemaRef(operation.requestBody?.content?.['application/json']?.schema),
    successResponseSchemaRefs: successResponseSchemaRefs(operation.responses ?? {}),
  };
}

function validateOperations(operations) {
  const issues = [];
  const operationIds = new Set();
  const clientNames = new Set();

  for (const operation of operations) {
    if (operation.operationId.trim().length === 0) {
      issues.push(`${operation.method} ${operation.path} missing operationId`);
    }

    if (operationIds.has(operation.operationId)) {
      issues.push(`Duplicate operationId: ${operation.operationId}`);
    }
    operationIds.add(operation.operationId);

    if (clientNames.has(operation.clientName)) {
      issues.push(`Duplicate generated clientName: ${operation.clientName}`);
    }
    clientNames.add(operation.clientName);

    if (operation.usesDevOnlyWorkspaceRoleHeader && !operation.supportsBearerApiKey && !operation.devOnlyWorkspaceRoleRequired) {
      issues.push(`${operation.operationId} has workspace role header but no Bearer API key path`);
    }
  }

  validateFrontendCriticalOperations(operations, issues);

  return issues;
}

function validateFrontendCriticalOperations(operations, issues) {
  const operationsById = new Map(
    operations.map((operation) => [operation.operationId, operation]),
  );

  for (const requirement of frontendCriticalOperations) {
    const operation = operationsById.get(requirement.operationId);
    if (operation === undefined) {
      issues.push(`Missing frontend-critical operation: ${requirement.operationId}`);
      continue;
    }

    if (operation.method !== 'GET') {
      issues.push(`${requirement.operationId} must remain a GET operation`);
    }
    if (!operation.requiresTenantWorkspace) {
      issues.push(`${requirement.operationId} must require tenant/workspace headers`);
    }
    if (!operation.supportsBearerApiKey) {
      issues.push(`${requirement.operationId} must support bearer API key auth`);
    }
    requireIncludesAll(
      operation.pathParameters,
      requirement.requiredPathParameters ?? [],
      `${requirement.operationId} pathParameters`,
      issues,
    );
    requireIncludesAll(
      operation.queryParameters,
      requirement.requiredQueryParameters ?? [],
      `${requirement.operationId} queryParameters`,
      issues,
    );
    requireIncludesAll(
      operation.successResponseSchemaRefs,
      requirement.requiredResponseSchemaRefs,
      `${requirement.operationId} successResponseSchemaRefs`,
      issues,
    );
  }
}

function requireIncludesAll(actual, expected, label, issues) {
  for (const item of expected) {
    if (!actual.includes(item)) {
      issues.push(`${label} missing ${item}`);
    }
  }
}

function schemaRef(schema) {
  if (schema?.$ref !== undefined) {
    return schema.$ref;
  }

  return null;
}

function successResponseSchemaRefs(responses) {
  return Object.entries(responses)
    .filter(([status]) => /^2\d\d$/.test(status))
    .map(([, response]) => schemaRef(response.content?.['application/json']?.schema))
    .filter((ref) => ref !== null)
    .sort();
}

function sanitizeOperationId(operationId) {
  const sanitized = operationId
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (/^[a-zA-Z_]/.test(sanitized)) {
    return sanitized;
  }

  return `operation_${sanitized}`;
}

function uniqueClientName(baseName, usedClientNames) {
  const usedCount = usedClientNames.get(baseName) ?? 0;
  usedClientNames.set(baseName, usedCount + 1);

  return usedCount === 0 ? baseName : `${baseName}_${usedCount + 1}`;
}

function renderClient(operations) {
  return [
    '// Generated by scripts/check-mobile-client-contract.mjs. Do not edit manually.',
    '',
    `export const mobileApiErrorModel = ${JSON.stringify(problemDetailsErrorModel(), null, 2)} as const;`,
    '',
    `export const mobileApiOperations = ${JSON.stringify(operations, null, 2)} as const;`,
    '',
    'export type MobileApiProblemCode = (typeof mobileApiErrorModel.problemCodes)[number]["code"];',
    'export type MobileApiOperation = (typeof mobileApiOperations)[number];',
    'export type MobileApiOperationId = MobileApiOperation["operationId"];',
    '',
    'export const mobileApiOperationById: ReadonlyMap<MobileApiOperationId, MobileApiOperation> = new Map(',
    '  mobileApiOperations.map((operation) => [operation.operationId, operation]),',
    ');',
    '',
  ].join('\n');
}

function renderDartClient(operations) {
  return [
    '// Generated by scripts/check-mobile-client-contract.mjs. Do not edit manually.',
    '// ignore_for_file: public_member_api_docs',
    '',
    `const socialMonitorApiErrorModel = <String, Object?>${renderDartValue(problemDetailsErrorModel())};`,
    '',
    `const socialMonitorApiOperations = <Map<String, Object?>>${renderDartValue(operations)};`,
    '',
    'Map<String, Object?> socialMonitorApiOperationById(String operationId) =>',
    '    socialMonitorApiOperations.firstWhere(',
    "      (operation) => operation['operationId'] == operationId,",
    "      orElse: () => throw ArgumentError.value(operationId, 'operationId', 'Unknown Social Monitor API operation'),",
    '    );',
    '',
  ].join('\n');
}

function problemDetailsErrorModel() {
  return {
    contentType: 'application/problem+json compatible JSON body',
    fields: {
      type: 'string',
      title: 'string',
      status: 'number',
      detail: 'string',
      code: 'ProblemCode',
      requestId: 'string',
      correlationId: 'string',
      causationId: 'string optional',
      details: 'object',
    },
    problemCodes: [
      { code: 'validation.failed', status: 400 },
      { code: 'tenant.scope_missing', status: 400 },
      { code: 'authentication.required', status: 401 },
      { code: 'authorization.denied', status: 403 },
      { code: 'resource.not_found', status: 404 },
      { code: 'operation.conflict', status: 409 },
      { code: 'request.too_large', status: 413 },
      { code: 'operation.backpressure', status: 429 },
      { code: 'operation.quota_exceeded', status: 429 },
      { code: 'operation.rate_limited', status: 429 },
      { code: 'external.dependency_unavailable', status: 503 },
      { code: 'internal.unexpected', status: 500 },
    ],
  };
}

function renderDartValue(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const nestedPad = ' '.repeat(indent + 2);

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return `[\n${value.map((item) => `${nestedPad}${renderDartValue(item, indent + 2)},`).join('\n')}\n${pad}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return '{}';
    }

    return `{\n${entries
      .map(([key, nested]) => `${nestedPad}${renderDartValue(key)}: ${renderDartValue(nested, indent + 2)},`)
      .join('\n')}\n${pad}}`;
  }

  throw new Error(`Unsupported Dart value type: ${typeof value}`);
}
