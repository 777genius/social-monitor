import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({ options: {
  date: { type: 'string', default: '2026-11-01' },
  url: { type: 'string', default: 'https://social-monitor.app/summaries' },
  out: { type: 'string', default: 'docs/assets/readme-preview' },
  channel: { type: 'string' },
  help: { type: 'boolean' },
} });
if (values.help) {
  console.log('npm run generate -- --date YYYY-MM-DD [--url URL] [--out PATH] [--channel chrome]');
  process.exit(0);
}
const date = values.date!;
const target = new Date(`${date}T12:00:00Z`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(target.getTime()) || target.toISOString().slice(0, 10) !== date) {
  throw new Error('Expected a real date in YYYY-MM-DD format');
}
const url = new URL(values.url!);
if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
  throw new Error('Use a public HTTP(S) page URL without credentials, query or fragment');
}
const output = resolve(root, values.out!);
// A failed capture never replaces the last complete README image.
const staging = `${output}.staging-${process.pid}`;
await mkdir(staging, { recursive: true });
const expectedDate = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const browser = await chromium.launch({ headless: true, ...(values.channel ? { channel: values.channel } : {}) });
const sizes = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function selectDate(page: Page): Promise<void> {
  const dateButton = page.getByRole('button', { name: /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/ });
  await dateButton.waitFor({ timeout: 60_000 });
  const initial = new Date(`${await dateButton.innerText()} 12:00:00 GMT`);
  if (!Number.isFinite(initial.getTime())) throw new Error('Cannot read the current summary date');
  const months = (target.getUTCFullYear() - initial.getUTCFullYear()) * 12 + target.getUTCMonth() - initial.getUTCMonth();
  if (Math.abs(months) > 36) throw new Error('Date must be within 36 months of the current summary');
  await dateButton.click();
  const dialog = page.getByRole('dialog');
  for (let n = 0; n < Math.abs(months); n++) {
    await dialog.getByRole('button', { name: months < 0 ? 'Previous month' : 'Next month', exact: true }).click();
  }
  await dialog.getByRole('button', { name: String(target.getUTCDate()), exact: true }).click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: expectedDate, exact: true }).waitFor();
  // Flutter virtualizes content: the post filters are below the fold on smaller screens.
  await page.waitForFunction(() => document.querySelector('flt-semantics-host')?.textContent?.includes('reviewed'), undefined, { timeout: 60_000 });
}

try {
  const captures: Record<string, string> = {};
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2, colorScheme: 'dark', locale: 'en-US', timezoneId: 'UTC',
    });
    try {
      const page = await context.newPage();
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const semantics = page.locator('flt-semantics-placeholder');
      await semantics.waitFor({ state: 'attached', timeout: 60_000 });
      await semantics.evaluate((element) => (element as HTMLElement).click());
      await selectDate(page);
      await page.mouse.move(size.width - 2, size.height - 2);
      // Flutter uses an internal scroll view; wheel over the reading pane resets it.
      await page.mouse.wheel(0, -100_000);
      await page.waitForTimeout(1800);
      const fit = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
      if (fit.horizontalOverflow) throw new Error(`${size.name}: horizontal overflow`);
      const snapshot = await page.locator('body').ariaSnapshot();
      if (!snapshot.includes(expectedDate) || !snapshot.includes('reviewed')) throw new Error(`${size.name}: summary not ready`);
      const bytes = await page.screenshot({ path: join(staging, `${size.name}.png`), animations: 'disabled' });
      captures[size.name.toUpperCase()] = `data:image/png;base64,${bytes.toString('base64')}`;
      console.log(`${size.name}: ${fit.width}x${fit.height}, ${expectedDate}`);
    } finally { await context.close(); }
  }
  let template = await readFile(new URL('device-showcase.html', import.meta.url), 'utf8');
  template = template.replace('{{DATE}}', date);
  for (const [key, image] of Object.entries(captures)) template = template.replace(`{{${key}}}`, image);
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 1 });
  await page.setContent(template);
  await page.locator('img').evaluateAll(async (images) => Promise.all(images.map(image => {
    if (!(image instanceof HTMLImageElement)) throw new Error('Expected a screenshot image');
    return image.decode();
  })));
  await page.screenshot({ path: join(staging, 'showcase.png') });
  await writeFile(join(staging, 'capture.json'), `${JSON.stringify({ source: url.href, date, theme: 'dark', sizes, capturedAt: new Date().toISOString(), playwright: '1.64.1' }, null, 2)}\n`);
  await mkdir(output, { recursive: true });
  for (const name of ['desktop.png', 'tablet.png', 'mobile.png', 'capture.json', 'showcase.png']) {
    await rename(join(staging, name), join(output, name));
  }
  console.log(`Saved ${join(output, 'showcase.png')}`);
} finally {
  await browser.close();
  await rm(staging, { recursive: true, force: true });
}
