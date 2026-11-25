import { existsSync, readFileSync } from 'node:fs';

const reportPath = 'ops/release/beta-feedback-classification-report.json';
const packagePath = 'package.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const violations = [];

const allowedCategories = new Set([
  'wrong_fact',
  'missing_source',
  'bad_citation',
  'low_relevance',
  'too_verbose',
  'too_terse',
  'source_request',
  'ux_confusing',
  'other',
]);
const allowedClassifications = new Set([
  'blocker',
  'accepted_mvp_gap',
  'evidence_based_opportunity',
  'deferred_idea',
]);
const allowedOwners = new Set([
  'product-owner',
  'source-owner',
  'summary-owner',
  'support-owner',
]);
const expectedOwnerByCategory = {
  wrong_fact: 'summary-owner',
  missing_source: 'summary-owner',
  bad_citation: 'summary-owner',
  low_relevance: 'summary-owner',
  too_verbose: 'product-owner',
  too_terse: 'product-owner',
  source_request: 'source-owner',
  ux_confusing: 'product-owner',
  other: 'support-owner',
};
const evalFixtureCategories = new Set([
  'wrong_fact',
  'missing_source',
  'bad_citation',
  'low_relevance',
]);

const fail = (message) => {
  violations.push(message);
};

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

if (report.schemaVersion !== 1) {
  fail(`${reportPath}: schemaVersion must be 1`);
}

if (report.reportId !== 'beta-feedback-classification-report-mvp-v1') {
  fail(`${reportPath}: reportId must be beta-feedback-classification-report-mvp-v1`);
}

if (!['deterministic_pre_beta_fixture', 'redacted_beta_samples'].includes(report.evidenceMode)) {
  fail(`${reportPath}: evidenceMode must be deterministic_pre_beta_fixture or redacted_beta_samples`);
}

for (const [field, command] of Object.entries(report.sourceOfTruth ?? {})) {
  if (!String(command).startsWith('npm run ')) {
    fail(`${reportPath}: sourceOfTruth.${field} must reference an npm script`);
    continue;
  }

  const scriptName = String(command).replace(/^npm run /, '');
  if (!scripts[scriptName]) {
    fail(`${reportPath}: sourceOfTruth.${field} references missing npm script "${scriptName}"`);
  }
}

if (report.privacyGuardrails?.rawProviderPayloadsIncluded !== false) {
  fail(`${reportPath}: raw provider payloads must not be included`);
}

if (report.privacyGuardrails?.piiIncluded !== false) {
  fail(`${reportPath}: PII must not be included`);
}

if (report.privacyGuardrails?.commentsAreSyntheticOrRedacted !== true) {
  fail(`${reportPath}: comments must be synthetic or redacted`);
}

const retentionPolicy = report.privacyGuardrails?.retentionPolicy;
if (!nonEmptyString(retentionPolicy) || !existsSync(retentionPolicy)) {
  fail(`${reportPath}: privacyGuardrails.retentionPolicy must reference an existing file`);
}

const policyClassifications = new Set(report.classificationPolicy?.supportedClassifications ?? []);
for (const classification of allowedClassifications) {
  if (!policyClassifications.has(classification)) {
    fail(`${reportPath}: classificationPolicy must include "${classification}"`);
  }
}

if (report.classificationPolicy?.sourceRequestPolicy !== 'capture_as_roadmap_evidence_without_enabling_beta_binding') {
  fail(`${reportPath}: source_request policy must prevent beta binding side effects`);
}

for (const [category, owner] of Object.entries(expectedOwnerByCategory)) {
  if (report.ownerRouting?.[category] !== owner) {
    fail(`${reportPath}: ownerRouting.${category} must be ${owner}`);
  }
}

const findings = Array.isArray(report.findings) ? report.findings : [];
if (findings.length < 5) {
  fail(`${reportPath}: findings must include enough examples to cover blockers, gaps, source requests and opportunities`);
}

const seenFeedbackIds = new Set();
const classificationCounts = Object.fromEntries([...allowedClassifications].map((classification) => [classification, 0]));
const ownerCounts = Object.fromEntries([...allowedOwners].map((owner) => [owner, 0]));
const launchDecisionCounts = {};

for (const finding of findings) {
  const id = finding.feedbackId;
  if (!nonEmptyString(id)) {
    fail(`${reportPath}: every finding must define feedbackId`);
  } else if (seenFeedbackIds.has(id)) {
    fail(`${reportPath}: duplicate feedbackId "${id}"`);
  } else {
    seenFeedbackIds.add(id);
  }

  if (!allowedCategories.has(finding.category)) {
    fail(`${reportPath}: finding "${id}" has unsupported category "${finding.category}"`);
  }

  if (!allowedClassifications.has(finding.classification)) {
    fail(`${reportPath}: finding "${id}" has unsupported classification "${finding.classification}"`);
  } else {
    classificationCounts[finding.classification] += 1;
  }

  if (!allowedOwners.has(finding.triageOwner)) {
    fail(`${reportPath}: finding "${id}" has unsupported triageOwner "${finding.triageOwner}"`);
  } else {
    ownerCounts[finding.triageOwner] += 1;
  }

  if (expectedOwnerByCategory[finding.category] !== finding.triageOwner) {
    fail(`${reportPath}: finding "${id}" routes ${finding.category} to ${finding.triageOwner}, expected ${expectedOwnerByCategory[finding.category]}`);
  }

  for (const field of ['severity', 'sanitizedSignal', 'action', 'backlogItemId', 'launchDecisionImpact']) {
    if (!nonEmptyString(finding[field])) {
      fail(`${reportPath}: finding "${id}" must define ${field}`);
    }
  }

  const evidence = finding.summaryEvidence ?? {};
  if (!nonEmptyString(evidence.summaryId) || !nonEmptyString(evidence.interestId)) {
    fail(`${reportPath}: finding "${id}" must include summaryId and interestId evidence`);
  }

  if (evalFixtureCategories.has(finding.category)) {
    for (const field of ['citationId', 'feedItemId', 'sourceItemId', 'providerKey']) {
      if (!nonEmptyString(evidence[field])) {
        fail(`${reportPath}: finding "${id}" must include ${field} evidence`);
      }
    }
  }

  if (finding.eligibleForEvalFixture === true && !evalFixtureCategories.has(finding.category)) {
    fail(`${reportPath}: finding "${id}" cannot be eval-fixture eligible for category ${finding.category}`);
  }

  if (evalFixtureCategories.has(finding.category) && finding.eligibleForEvalFixture !== true) {
    fail(`${reportPath}: finding "${id}" should stay eligible for eval fixture evidence`);
  }

  if (finding.category === 'source_request') {
    if (finding.triageOwner !== 'source-owner') {
      fail(`${reportPath}: source request "${id}" must route to source-owner`);
    }

    if (finding.eligibleForEvalFixture !== false) {
      fail(`${reportPath}: source request "${id}" must not enter summary eval fixtures`);
    }

    if (!nonEmptyString(finding.requestedProvider)) {
      fail(`${reportPath}: source request "${id}" must include requestedProvider`);
    }

    if (finding.launchDecisionImpact !== 'no_binding_change') {
      fail(`${reportPath}: source request "${id}" must not change beta binding state`);
    }

    if (finding.classification === 'blocker') {
      fail(`${reportPath}: source request "${id}" must not be a blocker for current enabled-source MVP`);
    }
  }

  launchDecisionCounts[finding.launchDecisionImpact] = (launchDecisionCounts[finding.launchDecisionImpact] ?? 0) + 1;
}

for (const requiredClassification of [
  'blocker',
  'accepted_mvp_gap',
  'evidence_based_opportunity',
  'deferred_idea',
]) {
  if (classificationCounts[requiredClassification] < 1) {
    fail(`${reportPath}: findings must include at least one ${requiredClassification}`);
  }
}

for (const requiredOwner of [
  'summary-owner',
  'source-owner',
  'product-owner',
]) {
  if (ownerCounts[requiredOwner] < 1) {
    fail(`${reportPath}: findings must route at least one item to ${requiredOwner}`);
  }
}

if (report.rollup?.totalFindings !== findings.length) {
  fail(`${reportPath}: rollup.totalFindings must equal findings length`);
}

for (const [classification, count] of Object.entries(classificationCounts)) {
  if (report.rollup?.classificationCounts?.[classification] !== count) {
    fail(`${reportPath}: rollup.classificationCounts.${classification} must be ${count}`);
  }
}

for (const [owner, count] of Object.entries(ownerCounts)) {
  if (report.rollup?.ownerCounts?.[owner] !== count) {
    fail(`${reportPath}: rollup.ownerCounts.${owner} must be ${count}`);
  }
}

for (const [decision, count] of Object.entries(launchDecisionCounts)) {
  if (report.rollup?.launchDecisionCounts?.[decision] !== count) {
    fail(`${reportPath}: rollup.launchDecisionCounts.${decision} must be ${count}`);
  }
}

if (report.releaseDecision?.privateBetaMvpStatus !== 'operator_ready_with_known_limitations') {
  fail(`${reportPath}: private beta MVP status must remain operator_ready_with_known_limitations`);
}

if (report.releaseDecision?.externalRingExpansionStatus !== 'hold_until_real_feedback_report_replaces_fixture') {
  fail(`${reportPath}: external ring expansion must wait for real redacted feedback evidence`);
}

if (!Array.isArray(report.releaseDecision?.requiredBeforeExpansion) || report.releaseDecision.requiredBeforeExpansion.length < 3) {
  fail(`${reportPath}: releaseDecision.requiredBeforeExpansion must list concrete conditions`);
}

const serializedReport = JSON.stringify(report).toLowerCase();
for (const forbidden of [
  'access_token',
  'authorization',
  'cookie',
  'raw_payload',
  'secret',
]) {
  if (serializedReport.includes(forbidden)) {
    fail(`${reportPath}: report must not include "${forbidden}"`);
  }
}

if (!scripts['check:beta-feedback-report']) {
  fail(`${packagePath}: missing check:beta-feedback-report script`);
} else if (!verifyScript.includes('npm run check:beta-feedback-report')) {
  fail(`${packagePath}: npm run verify must include check:beta-feedback-report`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Beta feedback classification report OK');
