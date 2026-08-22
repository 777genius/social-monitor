final class ReaderSummaryReservedMarker {
  const ReaderSummaryReservedMarker.valid(this.value)
    : isPresent = true,
      isValid = true;
  const ReaderSummaryReservedMarker.invalid()
    : value = null,
      isPresent = true,
      isValid = false;
  const ReaderSummaryReservedMarker.absent()
    : value = null,
      isPresent = false,
      isValid = false;

  final String? value;
  final bool isPresent;
  final bool isValid;
}
