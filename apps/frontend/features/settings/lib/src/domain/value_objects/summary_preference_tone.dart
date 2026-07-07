enum SummaryPreferenceTone { analytical, concise, neutral, unknown }

extension SummaryPreferenceToneLabel on SummaryPreferenceTone {
  String get label {
    return switch (this) {
      SummaryPreferenceTone.analytical => 'Analytical',
      SummaryPreferenceTone.concise => 'Concise',
      SummaryPreferenceTone.neutral => 'Neutral',
      SummaryPreferenceTone.unknown => 'Unknown',
    };
  }
}
