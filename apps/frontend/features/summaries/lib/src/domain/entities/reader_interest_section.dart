import 'top_read.dart';

final class ReaderInterestSection {
  const ReaderInterestSection({
    required this.title,
    required this.insight,
    required this.items,
    required this.citationIds,
    this.interestId,
  });

  final String title;
  final String insight;
  final List<TopRead> items;
  final List<String> citationIds;
  final String? interestId;
}
