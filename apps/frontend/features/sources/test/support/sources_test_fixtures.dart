import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
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
