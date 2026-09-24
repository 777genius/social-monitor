import { JSDOM } from 'jsdom';

import type { RssTextType } from './rss-client.port';

const htmlC1Replacements: Readonly<Record<number, string>> = {
  128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡',
  136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž',
  145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—',
  152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ',
};

/** Check visible text without changing the content retained on the feed item. */
export const hasReadableFeedText = (value: string | undefined, type: RssTextType = 'html'): boolean => {
  if (value === undefined || type === 'unsupported') return false;

  // XML parsing may have expanded numeric references before HTML parsing.
  const html = value.replace(/[\u0080-\u009f]/gu, (character) =>
    htmlC1Replacements[character.codePointAt(0) ?? 0] ?? character);
  const visible = type === 'text' ? value : visibleHtmlText(JSDOM.fragment(html));
  // Ignore invisible selectors, joiners and whitespace only for this check.
  return visible.replace(/[\p{Default_Ignorable_Code_Point}\p{White_Space}\p{Cc}]/gu, '').length > 0;
};

const visibleHtmlText = (node: Node): string => {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.nodeType === 8) return '';
  if (node.nodeType === 1 && /^(?:[^:]+:)?(?:script|style|template)$/iu.test((node as Element).localName)) return '';
  return Array.from(node.childNodes, visibleHtmlText).join('');
};
