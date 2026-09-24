import { JSDOM } from 'jsdom';

// The object XML parser loses mixed-content order (text before/after inline
// elements). Read XHTML from the XML DOM instead of walking that object.
export const atomXhtmlContents = (xml: string): readonly (string | undefined)[] => {
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  try {
    return [...dom.window.document.getElementsByTagNameNS('*', 'entry')].map((entry) => {
      const content = [...entry.children].find((child) => child.localName === 'content')
        ?? [...entry.children].find((child) => child.localName === 'summary');
      if (content?.getAttribute('type') !== 'xhtml') {
        return undefined;
      }
      for (const element of [...content.querySelectorAll('script, style')]) {
        element.remove();
      }
      for (const element of [...content.querySelectorAll('p, div, li, br, h1, h2, h3, blockquote')]) {
        element.append('\n');
      }
      return content.textContent?.trim() || undefined;
    });
  } finally {
    dom.window.close();
  }
};
