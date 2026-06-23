import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/infrastructure/api/scan_policy_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api/scan_run_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_binding_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_profile_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_summary_api_dto.dart';

const sourceWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

SourceSummaryApiDto sourceSummaryApiDto({
  String id = 'rss',
  String name = 'RSS feeds',
  String credentialHealth = 'expired',
  String healthLabel = 'OAuth token expired',
  String capabilityKey = 'sources.rss',
  bool capabilityEnabled = true,
  String collectionStatus = 'collecting',
  String? capabilityDisabledReasonCode,
  String? credentialPreview = 'redacted-token-preview',
}) {
  return SourceSummaryApiDto(
    id: id,
    name: name,
    credentialHealth: credentialHealth,
    healthLabel: healthLabel,
    capabilityKey: capabilityKey,
    capabilityEnabled: capabilityEnabled,
    collectionStatus: collectionStatus,
    capabilityDisabledReasonCode: capabilityDisabledReasonCode,
    credentialPreview: credentialPreview,
  );
}

SourceProfileApiDto sourceProfileApiDto({
  String providerKey = 'reddit',
  String? displayName = 'Reddit',
  bool productionSafe = true,
  String readinessState = 'enabled_beta',
  String runtimeReadiness = 'live_beta_ready',
  String acquisitionMode = 'pull',
  List<String> supportedQueryModes = const ['keyword', 'boolean'],
  List<String> supportedContentUnits = const ['posts', 'comments'],
  String cursorModel = 'time-based',
  String quotaModel = 'rate limit',
  List<String> limitations = const [
    'Rate limits vary by subreddit and endpoint',
  ],
  List<String> liveBetaBlockers = const [],
  num? capabilityVersion = 1,
}) {
  return SourceProfileApiDto(
    providerKey: providerKey,
    displayName: displayName,
    productionSafe: productionSafe,
    readinessState: readinessState,
    runtimeReadiness: runtimeReadiness,
    acquisitionMode: acquisitionMode,
    supportedQueryModes: supportedQueryModes,
    supportedContentUnits: supportedContentUnits,
    cursorModel: cursorModel,
    quotaModel: quotaModel,
    limitations: limitations,
    liveBetaBlockers: liveBetaBlockers,
    capabilityVersion: capabilityVersion,
  );
}

SourceBindingApiDto sourceBindingApiDto({
  String id = 'binding-reddit',
  String topicId = 'topic-competitor',
  String providerKey = 'reddit',
  num capabilityProfileVersion = 1,
  String status = 'enabled',
  Map<String, Object?> configPreview = const {
    'mode': 'listing',
    'subreddit': 'startups',
    'listing': 'new',
  },
  DateTime? createdAt,
}) {
  return SourceBindingApiDto(
    id: id,
    topicId: topicId,
    providerKey: providerKey,
    capabilityProfileVersion: capabilityProfileVersion,
    status: status,
    configPreview: configPreview,
    createdAt: createdAt ?? DateTime.utc(2026, 6, 23, 12),
  );
}

ScanPolicyApiDto scanPolicyApiDto({
  String id = 'scan-policy-reddit',
  String sourceBindingId = 'binding-reddit',
  num intervalSeconds = 3600,
  num freshnessSeconds = 3600,
  num retryBudget = 3,
  DateTime? nextRunAt,
  DateTime? createdAt,
}) {
  return ScanPolicyApiDto(
    id: id,
    sourceBindingId: sourceBindingId,
    intervalSeconds: intervalSeconds,
    freshnessSeconds: freshnessSeconds,
    retryBudget: retryBudget,
    nextRunAt: nextRunAt ?? DateTime.utc(2026, 6, 23, 13),
    createdAt: createdAt ?? DateTime.utc(2026, 6, 23, 12),
  );
}

ScanStatusApiDto scanStatusApiDto({
  String scanJobId = 'scan-job-reddit',
  String sourceBindingId = 'binding-reddit',
  String scanPolicyId = 'scan-policy-reddit',
  String status = 'succeeded',
  String userState = 'content_current',
  String? failureClass,
  String operatorAction = 'Content is current',
  DateTime? requestedAt,
  DateTime? enqueuedAt,
  DateTime? completedAt,
  String? failureReason,
  ScanExecutionAttemptApiDto? latestAttempt,
}) {
  return ScanStatusApiDto(
    scanJobId: scanJobId,
    sourceBindingId: sourceBindingId,
    scanPolicyId: scanPolicyId,
    status: status,
    userState: userState,
    failureClass: failureClass,
    operatorAction: operatorAction,
    requestedAt: requestedAt ?? DateTime.utc(2026, 6, 23, 12),
    enqueuedAt: enqueuedAt ?? DateTime.utc(2026, 6, 23, 12),
    completedAt: completedAt ?? DateTime.utc(2026, 6, 23, 12, 2),
    failureReason: failureReason,
    latestAttempt: latestAttempt ?? scanAttemptApiDto(),
  );
}

ScanExecutionAttemptApiDto scanAttemptApiDto({
  String sourceBindingId = 'binding-reddit',
  String status = 'succeeded',
  DateTime? startedAt,
  DateTime? finishedAt,
  num fetched = 42,
  num inserted = 31,
  num skippedDuplicates = 8,
  num projected = 31,
  String? failureReason,
}) {
  return ScanExecutionAttemptApiDto(
    sourceBindingId: sourceBindingId,
    status: status,
    startedAt: startedAt ?? DateTime.utc(2026, 6, 23, 12),
    finishedAt: finishedAt ?? DateTime.utc(2026, 6, 23, 12, 2),
    fetched: fetched,
    inserted: inserted,
    skippedDuplicates: skippedDuplicates,
    projected: projected,
    failureReason: failureReason,
  );
}
