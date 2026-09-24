import { XMLParser } from 'fast-xml-parser';

// These parses inspect parser-tokenized text and attributes. CDATA stays in its
// own node, so a literal reference inside CDATA is never treated as an entity.
const options = {
  preserveOrder: true,
  ignoreAttributes: false,
  cdataPropName: '#cdata',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: {
    maxEntitySize: 8192,
    maxEntityCount: 128,
    maxTotalExpansions: 10_000,
    maxExpandedLength: 1_000_000,
  },
};
const rawParser = new XMLParser({ ...options, processEntities: false });
// XML's five predefined names and declared internal entities are sufficient.
// HTML-only names are not valid in an XML feed without a declaration.
// The installed 5.8.0 parser accepts a named-entity map at runtime; its
// declaration still types this deprecated option as boolean only.
const resolvedParser = new XMLParser({ ...options, htmlEntities: {} as boolean });
// The original document still has to pass the stricter limits above. Probes
// may repeat each distinct reference once, so allow that bounded extra work.
const probeParser = new XMLParser({ ...options, htmlEntities: {} as boolean,
  processEntities: { ...options.processEntities,
    maxTotalExpansions: 20_000, maxExpandedLength: 2_000_000 },
});
const reference = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[\p{L}_][\p{L}\p{N}_.:-]*);/gu;
const unresolvedReference = new RegExp(reference.source, 'u');
const predefined = new Map([
  ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&apos;', "'"],
]);
const probeTag = '__rss_entity_evidence_probe';

export class RssEntityEvidenceError extends Error {
  constructor() { super('RSS XML entity references could not be safely resolved'); }
}

/** A reference that survives expansion cannot be certified as readable XML. */
export const assertResolvedXmlEntities = (xml: string): void => {
  if (!xml.includes('&')) return;

  let raw: unknown;
  try {
    raw = rawParser.parse(xml);
  } catch {
    throw new RssEntityEvidenceError();
  }
  const names = new Set<string>();
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
    } else if (typeof node === 'object' && node !== null) {
      for (const [key, value] of Object.entries(node)) {
        if (key === '#cdata') continue;
        collect(value);
      }
    } else if (typeof node === 'string') {
      for (const match of node.matchAll(reference)) {
        const token = match[0];
        if (!predefined.has(token) && !token.startsWith('&#')) {
          names.add(token);
          if (names.size > 128) throw new RssEntityEvidenceError();
        }
      }
    }
  };
  collect(raw);

  // The installed parser keeps DTD declarations for the whole parse. Appending
  // bounded probe nodes reveals each named reference's own expansion, even
  // when an escaped literal of the same spelling occurs in the original node.
  const probes = [...names].map((token) => `<${probeTag}>${token}</${probeTag}>`).join('');
  if (probes.length > 8192) throw new RssEntityEvidenceError();
  let parsedResolved: unknown;
  try {
    parsedResolved = resolvedParser.parse(xml);
  } catch {
    throw new RssEntityEvidenceError();
  }
  if (!Array.isArray(parsedResolved)) throw new RssEntityEvidenceError();
  const resolvedNodes: unknown[] = parsedResolved;
  const expansions = new Map<string, string>();
  let probeNodes: unknown[] = [];
  if (names.size > 0) {
    try {
      const parsedProbes: unknown = probeParser.parse(xml + probes);
      if (!Array.isArray(parsedProbes) || parsedProbes.length !== resolvedNodes.length + names.size) {
        throw new RssEntityEvidenceError();
      }
      probeNodes = parsedProbes.slice(-names.size);
    } catch {
      throw new RssEntityEvidenceError();
    }
  }
  [...names].forEach((token, index) => {
    const probe = probeNodes[index];
    const value = typeof probe === 'object' && probe !== null && !Array.isArray(probe)
      ? (probe as Record<string, unknown>)[probeTag] : undefined;
    const text = Array.isArray(value) && value.length === 1 &&
      typeof value[0] === 'object' && value[0] !== null
      ? (value[0] as Record<string, unknown>)['#text'] : undefined;
    if (typeof text !== 'string' || text === token || /[<>]/u.test(text) ||
        unresolvedReference.test(text)) {
      throw new RssEntityEvidenceError();
    }
    expansions.set(token, text);
  });
  const resolved = resolvedNodes;

  const expand = (token: string): string => {
    const known = predefined.get(token) ?? expansions.get(token);
    if (known !== undefined) return known;
    if (!token.startsWith('&#')) throw new RssEntityEvidenceError();
    const codePoint = token[2]?.toLowerCase() === 'x'
      ? Number.parseInt(token.slice(3, -1), 16)
      : Number.parseInt(token.slice(2, -1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new RssEntityEvidenceError();
    return String.fromCodePoint(codePoint);
  };
  const visit = (source: unknown, result: unknown): void => {
    if (Array.isArray(source)) {
      if (!Array.isArray(result)) throw new RssEntityEvidenceError();
      if (source.length !== result.length) throw new RssEntityEvidenceError();
      source.forEach((node, index) => visit(node, result[index]));
      return;
    }
    if (typeof source !== 'object' || source === null) return;
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new RssEntityEvidenceError();
    }
    const rawNode = source as Record<string, unknown>;
    const resolvedNode = result as Record<string, unknown>;
    for (const [key, value] of Object.entries(rawNode)) {
      if (key === '#cdata') continue;
      const replacement = resolvedNode[key];
      if (typeof value === 'string') {
        if (typeof replacement !== 'string') throw new RssEntityEvidenceError();
        if (value.replace(reference, expand) !== replacement) throw new RssEntityEvidenceError();
      } else {
        if (!(key in resolvedNode)) throw new RssEntityEvidenceError();
        visit(value, replacement);
      }
    }
  };
  visit(raw, resolved);
};
