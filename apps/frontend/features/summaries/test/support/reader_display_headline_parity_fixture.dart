import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'reader_display_headline_fixture.dart';

typedef DisplayParityCase = ({
  String name,
  bool accepted,
  Map<String, Object?> fixture,
});

Map<String, Object?> displayReference(
  String quote, {
  int start = 0,
  String field = 'bodyPreview',
}) => {
  'field': field,
  'start': start,
  'end': start + quote.length,
  'quote': quote,
};

/// Reseals synthetic exact sources, so a negative case reaches the predicate
/// under test instead of failing on an unrelated stale digest.
Map<String, Object?> displayParityFixture({
  String title = 'Orion model discussion',
  String body = 'Synthetic context.',
  String? displayTitle,
  String kind = 'claim',
  required List<Map<String, Object?>> support,
  List<Map<String, Object?>> qualifications = const [],
}) {
  final fixture = readerDisplayFixture();
  final headline = fixture['headline']! as Map<String, Object?>;
  final source = fixture['source']! as Map<String, Object?>;
  final binding = headline['binding']! as Map<String, Object?>;
  final availability = body.trim().isEmpty ? 'title_only' : 'body_present';
  source.addAll({
    'title': title,
    'body': body,
    'reviewAvailability': availability,
  });
  binding['availability'] = availability;
  final context = {
    for (final key in [
      'tenantId',
      'workspaceId',
      'interestId',
      'sourceBindingId',
      'sourceItemId',
      'trustedIntent',
      'availability',
    ])
      key: binding[key],
  };
  binding['reviewedInputDigest'] = _digest(
    jsonEncode({
      'candidateId': binding['candidateId'],
      'providerKey': binding['providerKey'],
      'context': context,
      'title': title,
      'body': body,
    }),
  );
  headline.addAll({
    'kind': kind,
    'text': displayTitle ?? title,
    'support': support,
    'qualifications': qualifications,
    'wholeInput': {
      'titleLength': title.length,
      'bodyLength': body.length,
      'qualificationJudgment': kind == 'subject_label'
          ? 'subject_only'
          : qualifications.isEmpty
          ? 'none'
          : 'preserved',
    },
  });
  (fixture['seal']! as Map<String, Object?>)['capturedSourceDigest'] = _digest(
    jsonEncode({
      'body': body,
      'captureAvailability': 'available',
      'reviewAvailability': availability,
      'title': title,
    }),
  );
  return fixture;
}

List<DisplayParityCase> displayParityCases() {
  final cases = <DisplayParityCase>[];
  void add(String name, bool accepted, Map<String, Object?> fixture) =>
      cases.add((name: name, accepted: accepted, fixture: fixture));
  void quotes(String name, bool accepted, List<String> values) {
    var offset = 0;
    final refs = <Map<String, Object?>>[];
    for (final quote in values) {
      refs.add(displayReference(quote, start: offset));
      offset += quote.length;
    }
    add(
      name,
      accepted,
      displayParityFixture(body: '${values.join()}x', support: refs),
    );
  }

  add('valid-control', true, readerDisplayFixture());
  add(
    'partial-subject-tokens',
    false,
    displayParityFixture(
      title: 'OrionFake modeling discussion',
      displayTitle: 'Orion model discussion',
      kind: 'subject_label',
      support: [
        displayReference('Orion', field: 'title'),
        displayReference('model', start: 10, field: 'title'),
      ],
    ),
  );
  for (final count in [255, 256, 257]) {
    quotes('quote-$count', count <= 256, ['x' * count]);
  }
  for (final count in [127, 128, 129]) {
    quotes('astral-quote-${count * 2}', count <= 128, ['🚀' * count]);
  }
  for (final total in [511, 512, 513]) {
    quotes('aggregate-$total', total <= 512, [
      'x' * 256,
      'y' * 254,
      'z' * (total - 510),
    ]);
  }
  // Every quote remains <=256, and only the encoded budget crosses its limit.
  for (final tail in [5, 6, 7]) {
    quotes('encoded-${1018 + tail}', tail <= 6, [
      '\u0001' * 85,
      '${'\u0001' * 84}${'x' * tail}',
    ]);
  }
  for (final count in [509, 510, 511]) {
    quotes('escaped-quotes-${count * 2 + 4}', count <= 510, [
      '"' * 255,
      '\\' * (count - 255),
    ]);
  }
  quotes('whitespace-support', false, ['   ']);
  quotes('unicode-whitespace', false, ['\t\n\r\u00a0\u2000\u2028\u2029\ufeff']);
  quotes('exact-surrounding-whitespace', true, [' \te\u0301🚀\n ']);
  quotes('non-JS-whitespace-next-line', true, ['\u0085']);
  quotes('non-JS-whitespace-zero-width-space', true, ['\u200b']);
  quotes('literal-json-and-unicode', true, [
    '\b\t\n\f\r"\\/\u0001\u001f\u2028\u2029e\u0301漢🚀',
  ]);
  const phrases = [
    'Orion',
    'model',
    'preliminary',
    'findings',
    'Orion model',
    'model preliminary',
    'preliminary findings',
    'Orion model preliminary',
  ];
  for (final count in [7, 8, 9]) {
    add(
      '$count-serialized-occurrences',
      count <= 8,
      displayParityFixture(
        title: 'Orion model preliminary findings',
        support: [displayReference('Orion', field: 'title')],
        qualifications: [
          for (final phrase in phrases.take(count - 1))
            {
              'phrase': phrase,
              'evidence': [displayReference('Orion', field: 'title')],
            },
        ],
      ),
    );
  }
  // Aggregate budgets also count repeated coordinates across different roles.
  for (final size in [64, 65]) {
    final quote = 'x' * size;
    add(
      'cross-role-aggregate-${size * 8}',
      size == 64,
      displayParityFixture(
        title: 'Orion model preliminary findings',
        body: quote,
        support: [displayReference(quote)],
        qualifications: [
          for (final phrase in phrases.take(7))
            {
              'phrase': phrase,
              'evidence': [displayReference(quote)],
            },
        ],
      ),
    );
  }
  for (final quote in ['x' * 256, 'x' * 257, '   ']) {
    add(
      'qualification-quote-${quote.length}-${quote.codeUnitAt(0)}',
      quote.length == 256,
      displayParityFixture(
        body: '${quote}x',
        support: [displayReference('Orion', field: 'title')],
        qualifications: [
          {
            'phrase': 'Orion',
            'evidence': [displayReference(quote)],
          },
        ],
      ),
    );
  }
  for (final count in [126, 127, 128]) {
    final quote = '"' * count;
    add(
      'cross-role-encoded-${(count * 2 + 2) * 4}',
      count <= 127,
      displayParityFixture(
        body: quote,
        support: [displayReference(quote)],
        qualifications: [
          for (final phrase in ['Orion', 'model', 'discussion'])
            {
              'phrase': phrase,
              'evidence': [displayReference(quote)],
            },
        ],
      ),
    );
  }
  for (final entity in ['\u{10400}rion', 'O\u0301rion']) {
    final title = '$entity model';
    add(
      'unicode-entity-$entity',
      true,
      displayParityFixture(
        title: title,
        kind: 'subject_label',
        displayTitle: '$title discussion',
        support: [
          displayReference(entity, field: 'title'),
          displayReference('model', start: entity.length + 1, field: 'title'),
        ],
      ),
    );
  }
  add(
    'duplicate-within-support',
    false,
    displayParityFixture(
      body: 'x',
      support: [displayReference('x'), displayReference('x')],
    ),
  );
  add(
    'split-surrogate',
    false,
    displayParityFixture(body: '🚀', support: [displayReference('\ud83d')]),
  );
  // Exercise BOTH sides of EVERY role in BOTH captured fields. Astral letters,
  // numbers and marks must be classified as code points, not surrogate units.
  const continuations = [
    'A',
    'é',
    '漢',
    '\u0301',
    '7',
    '_',
    '-',
    '—',
    '\u200c',
    '\u200d',
    '\u2060',
    '.',
    '+',
    '−',
    "'",
    '’',
    '\u{10400}',
    '\u{1d7ce}',
    '\u{1d165}',
  ];
  const boundaries = ['', ' ', '\n', '(', ')', ':', '/', '🚀'];
  for (final field in ['title', 'bodyPreview']) {
    for (final role in [0, 1, 2]) {
      for (final before in [true, false]) {
        for (final adjacent in [...continuations, ...boundaries]) {
          final tokens = ['Orion', 'v1.2', 'model'];
          var text = '';
          final refs = <Map<String, Object?>>[];
          for (var i = 0; i < tokens.length; i++) {
            if (i > 0) text += ' ';
            if (i == role && before) text += adjacent;
            refs.add(
              displayReference(tokens[i], start: text.length, field: field),
            );
            text += tokens[i];
            if (i == role && !before) text += adjacent;
          }
          final label = adjacent.runes
              .map((r) => r.toRadixString(16))
              .join('-');
          add(
            'boundary-$field-$role-$before-$label',
            !continuations.contains(adjacent),
            displayParityFixture(
              title: field == 'title' ? text : 'Synthetic source',
              body: field == 'bodyPreview' ? text : 'Synthetic context.',
              displayTitle: 'Orion v1.2 model discussion',
              kind: 'subject_label',
              support: refs,
            ),
          );
        }
      }
    }
  }
  return cases;
}

String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
