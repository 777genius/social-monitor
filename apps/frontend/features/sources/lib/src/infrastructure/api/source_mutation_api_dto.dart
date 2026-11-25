final class ConnectSourceApiRequestDto {
  const ConnectSourceApiRequestDto({
    required this.providerKey,
    required this.displayName,
  });

  final String providerKey;
  final String displayName;
}
