import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

const generatedReaderSummaryTopicMapConfidence =
    generated.ReaderSummaryTopicMapConfidenceDto(
      level: generated.ReaderSummaryTopicMapConfidenceDtoLevelLevel.medium,
      rationale: 'Clusters share agent-runtime evidence.',
      score: 0.76,
    );

const generatedReaderSummaryTopicMapDto = generated.ReaderSummaryTopicMapDto(
  confidence: generatedReaderSummaryTopicMapConfidence,
  edges: [
    generated.ReaderSummaryTopicMapEdgeDto(
      sourceNodeId: 'topic-ai-tools',
      targetNodeId: 'topic-codex',
      weight: 0.82,
      reason: 'Both topics cite agent tooling evidence.',
    ),
  ],
  generatedBy:
      generated.ReaderSummaryTopicMapDtoGeneratedByGeneratedBy.agentRuntime,
  groups: [
    generated.ReaderSummaryTopicMapGroupDto(
      colorKey: 'blue',
      confidence: generatedReaderSummaryTopicMapConfidence,
      id: 'group-agent-tools',
      label: 'Agent tools',
      nodeIds: ['topic-ai-tools', 'topic-codex'],
    ),
  ],
  nodes: [
    generated.ReaderSummaryTopicMapNodeDto(
      citationIds: ['bc-1'],
      evidenceCount: 12,
      groupId: 'group-agent-tools',
      id: 'topic-ai-tools',
      interestIds: ['ai-tools'],
      keywords: ['agents', 'tools'],
      label: 'AI tools',
      popularityScore: 1,
      providerKeys: ['github-trending-page'],
      rationale: 'GitHub Trending evidence centers on agent tooling.',
      sizeWeight: 0.9,
      storyClusterIds: ['story-1'],
    ),
    generated.ReaderSummaryTopicMapNodeDto(
      citationIds: ['bc-1'],
      evidenceCount: 7,
      groupId: 'group-agent-tools',
      id: 'topic-codex',
      interestIds: ['ai-tools'],
      keywords: ['codex'],
      label: 'Codex',
      popularityScore: 0.74,
      providerKeys: ['github-trending-page'],
      rationale: 'Codex appears in the same repository evidence.',
      sizeWeight: 0.68,
      storyClusterIds: ['story-1'],
    ),
  ],
  schemaVersion:
      generated.ReaderSummaryTopicMapDtoSchemaVersionSchemaVersion.undefined0,
  warnings: [],
);
