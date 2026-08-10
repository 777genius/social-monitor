import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/weekly_summary_evidence_limitation.dart';

class WeeklySummaryEvidenceLimitationsPanel extends StatelessWidget {
  const WeeklySummaryEvidenceLimitationsPanel({
    super.key,
    required this.limitations,
  });

  final List<WeeklySummaryEvidenceLimitation> limitations;

  @override
  Widget build(BuildContext context) {
    if (limitations.isEmpty) {
      return const SizedBox.shrink();
    }
    return Semantics(
      container: true,
      label: '${limitations.length} historical evidence limitations disclosed',
      child: Column(
        key: const ValueKey('weekly-summary-evidence-limitations'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppInlineProblem(
            title: 'Historical evidence limitation',
            message:
                'The listed provider evidence was not captured historically. No replacement evidence or inferred activity is shown.',
            tone: AppProblemTone.warning,
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final limitation in limitations)
            ListTile(
              leading: const Icon(Icons.history_toggle_off_outlined),
              title: Text(
                '${limitation.requestedUtcDate} · GitHub Trending',
              ),
              subtitle: Text(
                'Evidence state: ${limitation.evidenceState}\nProvider: ${limitation.providerKey}',
              ),
            ),
        ],
      ),
    );
  }
}
