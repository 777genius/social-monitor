final class CreateTopicApiRequestDto {
  const CreateTopicApiRequestDto({required this.name, required this.keywords});

  final String name;
  final List<String> keywords;
}

final class UpdateTopicApiRequestDto {
  const UpdateTopicApiRequestDto({
    required this.id,
    required this.name,
    required this.keywords,
  });

  final String id;
  final String name;
  final List<String> keywords;
}

final class ArchiveTopicApiRequestDto {
  const ArchiveTopicApiRequestDto({required this.id});

  final String id;
}
