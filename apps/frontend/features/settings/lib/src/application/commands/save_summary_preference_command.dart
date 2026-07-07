import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';

final class SaveSummaryPreferenceCommand {
  const SaveSummaryPreferenceCommand({
    required this.scope,
    required this.userId,
    required this.format,
    required this.tone,
    required this.includeRisks,
    required this.includeSourceHighlights,
    required this.customInstructions,
  });

  final WorkspaceScope scope;
  final String userId;
  final SummaryPreferenceFormat format;
  final SummaryPreferenceTone tone;
  final bool includeRisks;
  final bool includeSourceHighlights;
  final String customInstructions;
}
