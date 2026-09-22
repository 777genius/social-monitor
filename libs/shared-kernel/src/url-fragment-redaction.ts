// Fragment syntax is parsed here; credential key policy is supplied by redaction.ts.
type SensitiveNormalizedKeyClassifier = (
  normalizedKey: string, normalizedKeys: ReadonlySet<string>,
) => boolean;

type FragmentComponent = { raw: string; key: string };

const fragmentComponents = (raw: string): FragmentComponent[] => raw.split('&').map((part) => ({
  raw: part,
  key: new URLSearchParams(part).keys().next().value ?? '',
}));

const encodedBracketAt = (raw: string, index: number): '[' | ']' | '' => {
  const encoded = raw.slice(index, index + 3).toLowerCase();
  return encoded === '%5b' ? '[' : encoded === '%5d' ? ']' : '';
};

// An unclosed bracket is route text, not a reason to hide a later query or
// matrix delimiter. Match encoded and literal brackets within each key first.
const matchedBracketOpenings = (raw: string): ReadonlySet<number> => {
  const openings = new Set<number>();
  const pending: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const encoded = encodedBracketAt(raw, index);
    const bracket = encoded || raw.charAt(index);
    if (bracket === '[') pending.push(index);
    else if (bracket === ']' && pending.length > 0) {
      openings.add(pending.pop()!);
    } else if (bracket === '=' || bracket === '&') pending.length = 0;
    if (encoded) index += 2;
  }
  return openings;
};

// Brackets in a parameter name can contain a literal question mark. Route
// paths and values still expose query suffixes after a question mark.
const fragmentDelimiterStart = (raw: string, delimiters: string): number => {
  const matchedOpenings = matchedBracketOpenings(raw);
  let bracketDepth = 0;
  let inValue = false;
  let inRouteBase = raw.startsWith('/') || raw.startsWith('!');
  for (let index = 0; index < raw.length; index += 1) {
    const encodedBracket = !inValue && !inRouteBase ? encodedBracketAt(raw, index) : '';
    if (encodedBracket) {
      if (encodedBracket === '[' && matchedOpenings.has(index)) bracketDepth += 1;
      else if (encodedBracket === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      index += 2;
      continue;
    }
    if (raw[index] === '&') {
      bracketDepth = 0;
      inValue = false;
      inRouteBase = false;
    } else if (raw[index] === '=') {
      bracketDepth = 0;
      inValue = true;
      inRouteBase = false;
    } else if (bracketDepth === 0 && delimiters.includes(raw.charAt(index))) return index;
    else if (raw[index] === ';' && bracketDepth === 0) {
      inValue = false;
      inRouteBase = false;
    } else if (raw[index] === '/' && bracketDepth === 0 && !inValue) {
      // A matrix name can end at a route slash without an equals sign.
      // Brackets in the next segment belong to its route base.
      inRouteBase = true;
    } else if (!inValue && !inRouteBase && raw[index] === '[' && matchedOpenings.has(index)) bracketDepth += 1;
    else if (!inValue && !inRouteBase && raw[index] === ']') bracketDepth = Math.max(0, bracketDepth - 1);
  }
  return -1;
};

const fragmentQueryStart = (raw: string): number => fragmentDelimiterStart(raw, '?');

// Matrix separators are lexical: a semicolon inside a bracketed key belongs
// to that key, while a semicolon after '=' starts the next matrix field.
const matrixFields = (raw: string): FragmentComponent[] => {
  const fields: FragmentComponent[] = [];
  const matchedOpenings = matchedBracketOpenings(raw);
  let start = 0;
  let bracketDepth = 0;
  let inValue = false;
  for (let index = 0; index <= raw.length; index += 1) {
    const character = raw.charAt(index);
    const encodedBracket = !inValue ? encodedBracketAt(raw, index) : '';
    if (encodedBracket) {
      if (encodedBracket === '[' && matchedOpenings.has(index)) bracketDepth += 1;
      else if (encodedBracket === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      index += 2;
      continue;
    }
    if (index === raw.length || (character === ';' && bracketDepth === 0)) {
      const part = raw.slice(start, index);
      fields.push({ raw: part, key: new URLSearchParams(part).keys().next().value ?? '' });
      start = index + 1;
      bracketDepth = 0;
      inValue = false;
    } else if (character === '=') {
      bracketDepth = 0;
      inValue = true;
    } else if (!inValue && character === '[' && matchedOpenings.has(index)) bracketDepth += 1;
    else if (!inValue && character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
  }
  return fields;
};

// A slash inside a bracketed matrix name belongs to that name. A slash in a
// value still begins the next route segment, even if the value has brackets.
const routeSegments = (raw: string): string[] => {
  const segments: string[] = [];
  const matchedOpenings = matchedBracketOpenings(raw);
  let start = 0;
  let bracketDepth = 0;
  let inValue = false;
  for (let index = 0; index < raw.length; index += 1) {
    const encoded = !inValue ? encodedBracketAt(raw, index) : '';
    const bracket = encoded || raw.charAt(index);
    if (bracket === '[' && !inValue && matchedOpenings.has(index)) bracketDepth += 1;
    else if (bracket === ']' && !inValue) bracketDepth = Math.max(0, bracketDepth - 1);
    else if (bracketDepth === 0 && bracket === '/') {
      segments.push(raw.slice(start, index));
      start = index + 1;
      inValue = false;
    } else if (bracketDepth === 0 && bracket === ';') inValue = false;
    else if (bracket === '=') {
      bracketDepth = 0;
      inValue = true;
    }
    if (encoded) index += 2;
  }
  segments.push(raw.slice(start));
  return segments;
};

const routeMatrixStart = (
  segment: string,
  isSensitiveNormalizedKey: SensitiveNormalizedKeyClassifier,
): number => {
  const start = fragmentDelimiterStart(segment, ';');
  // A route-base bracket can enclose the separator itself. Interpret that
  // separator as matrix syntax when it introduces a credential field, even
  // if a later harmless field has an ordinary matrix separator.
  const nestedStart = segment.indexOf(';');
  if (nestedStart < 0 || nestedStart === start) return start;
  const fields = matrixFields(segment.slice(nestedStart + 1));
  return fields.some(({ key }) => {
    const normalized = key.toLowerCase();
    return isSensitiveNormalizedKey(normalized, new Set([normalized]));
  }) ? nestedStart : start;
};

// A question mark after an unmatched bracket can also be read as part of a
// matrix name. Inspect that interpretation as well: otherwise the first
// apparent query value can swallow a later `;access_token=...` field.
const stripAmbiguousMatrixCredentials = (
  raw: string,
  isSensitiveNormalizedKey: SensitiveNormalizedKeyClassifier,
): {
  sanitized: string; hasCredentials: boolean; keys: string[];
} => {
  const queryStart = fragmentQueryStart(raw);
  const firstEnd = raw.indexOf('&') < 0 ? raw.length : raw.indexOf('&');
  if (queryStart < 0 || queryStart >= firstEnd) {
    return { sanitized: raw, hasCredentials: false, keys: [] };
  }
  const first = raw.slice(0, firstEnd);
  const segments = routeSegments(first);
  const parsed = segments.map((segment) => {
    const matrixStart = routeMatrixStart(segment, isSensitiveNormalizedKey);
    return { segment, matrixStart, fields: matrixStart < 0
      ? [] : matrixFields(segment.slice(matrixStart + 1)) };
  });
  const keys = parsed.flatMap(({ fields }) => fields.map(({ key }) => key.toLowerCase()));
  if (keys.length === 0) return { sanitized: raw, hasCredentials: false, keys };
  const normalizedKeys = new Set([
    ...fragmentComponents(raw).map(({ key }) => key.toLowerCase()),
    ...fragmentComponents(raw.slice(queryStart + 1)).map(({ key }) => key.toLowerCase()),
    ...keys,
  ]);
  let segmentStart = 0;
  let hasCredentials = false;
  const safeSegments = parsed.map(({ segment, matrixStart, fields }) => {
    if (matrixStart < 0) {
      segmentStart += segment.length + 1;
      return segment;
    }
    let position = segmentStart + matrixStart + 1;
    const retained = fields.filter((field) => {
      const ambiguous = position > queryStart &&
        isSensitiveNormalizedKey(field.key.toLowerCase(), normalizedKeys);
      position += field.raw.length + 1;
      if (ambiguous) hasCredentials = true;
      return !ambiguous;
    });
    segmentStart += segment.length + 1;
    return `${segment.slice(0, matrixStart)}${retained.length > 0
      ? `;${retained.map(({ raw: field }) => field).join(';')}` : ''}`;
  });
  if (!hasCredentials) return { sanitized: raw, hasCredentials, keys };
  return { sanitized: `${safeSegments.join('/')}${raw.slice(firstEnd)}`, hasCredentials, keys };
};

// Classify the full list, route suffix, and leading matrix fields against the
// same original key set. Removing a companion must not change later decisions.
export const analyzeUrlFragment = (
  raw: string,
  isSensitiveNormalizedKey: SensitiveNormalizedKeyClassifier,
  isCredentialRoutePrefix: (key: string) => boolean,
): { hasCredentials: boolean; sanitized: string } => {
  const ambiguous = stripAmbiguousMatrixCredentials(raw, isSensitiveNormalizedKey);
  const fragment = ambiguous.sanitized;
  const full = fragmentComponents(fragment);
  const queryStart = fragmentQueryStart(fragment);
  const queryComponentIndex = queryStart < 0 ? -1 : fragment.slice(0, queryStart).split('&').length - 1;
  const suffix = queryStart < 0 ? [] : fragmentComponents(fragment.slice(queryStart + 1));
  const first = full[0]?.raw ?? '';
  const routeEnd = fragmentDelimiterStart(first, ';?');
  const routePrefix = routeEnd < 0 ? first : first.slice(0, routeEnd);
  const decodedRoutePrefix = new URLSearchParams(`${routePrefix}=`).keys().next().value ?? '';
  const normalizedRoutePrefix = decodedRoutePrefix.toLowerCase();
  const routeKey = normalizedRoutePrefix.replace(/(?:\[[^\]]*\])+$/, '');
  const credentialRoutePrefix = !decodedRoutePrefix.includes('/') &&
    isCredentialRoutePrefix(routeKey);
  const leadingRoute = first.startsWith('/') || first.startsWith('!') ||
    (!first.includes('=') && !credentialRoutePrefix) ||
    (routeEnd >= 0 && !routePrefix.includes('=') &&
      first[routeEnd + 1] !== '=' && !credentialRoutePrefix);
  const matrixEnd = queryComponentIndex === 0 ? queryStart : -1;
  const matrixText = leadingRoute
    ? first.slice(0, matrixEnd < 0 ? first.length : matrixEnd)
    : '';
  // A raw slash ends a route segment's matrix fields. Keep later segments
  // intact, and inspect their own fields for credentials as well.
  const matrixSegments = leadingRoute ? routeSegments(matrixText).map((segment) => {
    const start = routeMatrixStart(segment, isSensitiveNormalizedKey);
    return start < 0
      ? { base: segment, fields: [] as FragmentComponent[] }
      : { base: segment.slice(0, start), fields: matrixFields(segment.slice(start + 1)) };
  }) : [];
  const matrix = matrixSegments.flatMap(({ fields }) => fields);
  const normalizedKeys = new Set([...full, ...suffix, ...matrix]
    .map(({ key }) => key.toLowerCase()).concat(ambiguous.keys));
  const sensitive = (key: string): boolean =>
    isSensitiveNormalizedKey(key.toLowerCase(), normalizedKeys);
  const removeFull = new Set(full.flatMap(({ key }, index) =>
    !(leadingRoute && index === 0) && sensitive(key) ? [index] : []));
  const removeSuffix = new Set(suffix.flatMap(({ key }, index) =>
    sensitive(key) ? [index] : []));
  const removeMatrix = new Set(matrix.filter(({ key }) => sensitive(key)));
  // A '?' directly in a sensitive matrix name can make its value look like a
  // harmless query field. Drop that ambiguous first suffix with the field.
  const finalMatrixField = matrixSegments[matrixSegments.length - 1]?.fields.at(-1);
  if (queryComponentIndex === 0 && finalMatrixField &&
    !finalMatrixField.raw.includes('=') && sensitive(finalMatrixField.key)) {
    removeSuffix.add(0);
  }
  const hasCredentials = ambiguous.hasCredentials || removeFull.size > 0 ||
    removeSuffix.size > 0 || removeMatrix.size > 0;
  if (!hasCredentials) return { hasCredentials: false, sanitized: fragment };

  const retained = full.flatMap(({ raw: component }, index) => {
    if (removeFull.has(index) || (index > queryComponentIndex &&
      removeSuffix.has(index - queryComponentIndex))) return [];
    let safe = component;
    if (index === 0 && removeMatrix.size > 0) {
      safe = matrixSegments.map(({ base, fields }) => [base, ...fields.filter((field) =>
        !removeMatrix.has(field)).map(({ raw }) => raw)].join(';')).join('/') +
        component.slice(matrixText.length);
    }
    if (index === queryComponentIndex && removeSuffix.has(0)) {
      safe = safe.slice(0, fragmentQueryStart(safe));
    }
    return [{ raw: safe, index }];
  });
  const retainedQueryPrefix = retained.some(({ index }) => index === queryComponentIndex);
  let querySeparatorPending = retainedQueryPrefix && removeSuffix.has(0);
  const sanitized = retained.reduce((result, component, position) => {
    if (position === 0) return component.raw;
    if (querySeparatorPending && component.index > queryComponentIndex) {
      querySeparatorPending = false;
      return `${result}?${component.raw}`;
    }
    return `${result}&${component.raw}`;
  }, '');
  return { hasCredentials, sanitized };
};
