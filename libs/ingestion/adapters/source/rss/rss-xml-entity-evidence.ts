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
const reference = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[\p{L}_][\p{L}\p{N}_.:-]*);/gu;

export class RssEntityEvidenceError extends Error {
  constructor() { super('RSS XML entity references could not be safely resolved'); }
}

/** A reference that survives expansion cannot be certified as readable XML. */
export const assertResolvedXmlEntities = (xml: string): void => {
  if (!xml.includes('&')) return;

  let raw: unknown;
  let resolved: unknown;
  try {
    raw = rawParser.parse(xml);
    resolved = resolvedParser.parse(xml);
  } catch {
    throw new RssEntityEvidenceError();
  }
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
        for (const match of value.matchAll(reference)) {
          if (['&amp;', '&lt;', '&gt;', '&quot;', '&apos;'].includes(match[0])) continue;
          if (replacement.includes(match[0]) ||
              !match[0].startsWith('&#') && /[<>]/u.test(replacement) && !/[<>]/u.test(value)) {
            throw new RssEntityEvidenceError();
          }
        }
      } else {
        if (!(key in resolvedNode)) throw new RssEntityEvidenceError();
        visit(value, replacement);
      }
    }
  };
  visit(raw, resolved);
};
