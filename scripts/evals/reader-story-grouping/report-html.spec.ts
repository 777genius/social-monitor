import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { loadDataset } from "./dataset";
import { applyDecisions, caseRows, prepareBlock } from "./replay";
import { captureRequest, makeManifest, type RequestEnvelope } from "./requests";
import { buildReport, type ReportResult } from "./report";
import { renderHtml } from "./report-html";

let report: ReportResult;
beforeAll(async () => {
  const data = loadDataset();
  const blocks = await Promise.all(data.blocks.map((b) => prepareBlock(data, b)));
  const requests = (await Promise.all(blocks.map(captureRequest))).filter((r): r is RequestEnvelope => r !== undefined);
  const rows = (await Promise.all(blocks.map((b) => caseRows(data, b, applyDecisions(b))))).flat();
  const manifest = makeManifest(data, requests, { revision: "b".repeat(40), treeSha: "c".repeat(40), worktree: "clean" });
  report = buildReport(data, rows, "OFFLINE_DETERMINISTIC_NO_VERIFIER", manifest, []);
  expect(report.manifestSha256).toBe(canonicalJsonSha256(manifest));
});

it("renders Russian findings, truthful denominators and no Markdown prose in HTML", () => {
  const html = renderHtml(report);
  expect(html).toContain('<html lang="ru">');
  expect(html).toContain("Live: NOT_RUN — модель не запускалась");
  expect(html).toContain("Реальных ответов модели: 0");
  expect(html).toContain("15/15"); expect(html).toContain("42/49");
  expect(html).toContain("5 уже объединены правилами");
  expect(html).toContain("<strong>0</strong>");
  expect(html).toContain("не независимые ошибки");
  expect(html).toContain("Подготовлено 9 запросов на 22 пар");
  expect(html).toContain("0/0 — нет наблюдений");
  expect(html).not.toMatch(/\*\*|`|<pre>\s*(?:Режим|#)/);
  expect(html.match(/class="pair"/g)).toHaveLength(50);
  expect(html.match(/<h4>Ожидание<\/h4>/g)).toHaveLength(50);
  expect(html.match(/href="https?:\/\//g)).toHaveLength(100);
  expect(html).toContain(report.evaluatedSource.revision);
  expect(html).toContain(report.captureSourceRevision);
});

it("keeps captured regression visibly non-live even with normalized decisions", () => {
  const copy = structuredClone(report); copy.mode = "OFFLINE_CAPTURED_REGRESSION";
  copy.cases[0]!.model = false;
  const html = renderHtml(copy);
  expect(html).toContain("Live: NOT_RUN");
  expect(html).toContain("Тестовый ответ: разные события (не модель)");
  expect(html).not.toContain("Ответ модели:");
});

it("escapes untrusted text and URLs while retaining safe original links", () => {
  const copy = structuredClone(report);
  copy.cases[0]!.posts[0]!.title = '<img src=x onerror="alert(1)">';
  copy.cases[0]!.posts[0]!.url = 'javascript:alert(1)';
  copy.cases[0]!.rationaleRu = "<script>unsafe</script>";
  const html = renderHtml(copy);
  expect(html).not.toContain('<img'); expect(html).not.toContain('<script>');
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
});

it("uses bounded fluid layout for the requested 390/644/1280 viewports", () => {
  // Static contract only. A browser must separately measure actual scrollWidth.
  const html = renderHtml(report);
  expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
  expect(html).toContain('box-sizing:border-box;min-width:0');
  expect(html).toContain('overflow-wrap:anywhere');
  expect(html).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(html).toContain('white-space:pre-wrap');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
  expect(css).not.toMatch(/white-space:nowrap|[;{]\s*(?:min-width|width):\s*\d+px/);
  expect(html).not.toContain('overflow-x:hidden');
});
