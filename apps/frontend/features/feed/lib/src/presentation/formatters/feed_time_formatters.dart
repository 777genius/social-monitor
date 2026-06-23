String feedDateTimeLabel(DateTime value) {
  final utc = value.toUtc();
  return '${_two(utc.month)}/${_two(utc.day)} '
      '${_two(utc.hour)}:${_two(utc.minute)} UTC';
}

String feedShortTimeLabel(DateTime value) {
  final utc = value.toUtc();
  return '${_two(utc.hour)}:${_two(utc.minute)} UTC';
}

String _two(int value) => value.toString().padLeft(2, '0');
