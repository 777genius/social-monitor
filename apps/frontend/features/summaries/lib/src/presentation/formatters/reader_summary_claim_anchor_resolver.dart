/// Resolves where an inline evidence marker can be attached without guessing.
abstract final class ReaderSummaryClaimAnchorResolver {
  static int resolveEnd({required String text, String? claimText}) {
    final claim = claimText?.trim();
    if (claim == null || claim.isEmpty || text.isEmpty) {
      return text.length;
    }

    final tokens = claim
        .split(RegExp(r'\s+'))
        .where((token) => token.isNotEmpty)
        .map(RegExp.escape)
        .toList(growable: false);
    if (tokens.isEmpty) {
      return text.length;
    }

    final matches = RegExp(
      tokens.join(r'\s+'),
      caseSensitive: false,
      unicode: true,
    ).allMatches(text).take(2).toList(growable: false);
    if (matches.length != 1) {
      return text.length;
    }

    var end = matches.single.end;
    while (end < text.length && _isClosingPunctuation(text[end])) {
      end += 1;
    }
    return end;
  }

  static bool _isClosingPunctuation(String character) {
    return const <String>{
      '.',
      ',',
      ':',
      ';',
      '!',
      '?',
      ')',
      ']',
      '}',
      '"',
      "'",
      '\u2026',
      '\u2019',
      '\u201d',
    }.contains(character);
  }
}
