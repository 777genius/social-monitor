enum SummaryPreferenceFormat {
  executiveBrief,
  bulletDigest,
  riskBrief,
  unknown,
}

extension SummaryPreferenceFormatLabel on SummaryPreferenceFormat {
  String get label {
    return switch (this) {
      SummaryPreferenceFormat.executiveBrief => 'Brief',
      SummaryPreferenceFormat.bulletDigest => 'Bullets',
      SummaryPreferenceFormat.riskBrief => 'Risk',
      SummaryPreferenceFormat.unknown => 'Unknown',
    };
  }
}
