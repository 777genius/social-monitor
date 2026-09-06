import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { readJson, check } from "./dataset";
import type { Dataset } from "./dataset";
import type { CaseRow } from "./replay";

export const confusion = (rows: CaseRow[], prediction: (r: CaseRow) => boolean | null,
  target: (r: CaseRow) => boolean) => {
  let tp = 0; let fp = 0; let tn = 0; let fn = 0; let unavailable = 0; let ambiguous = 0;
  for (const r of rows) {
    if (!r.scored) { ambiguous++; continue; }
    const predicted = prediction(r); if (predicted === null) { unavailable++; continue; }
    const expected = target(r);
    if (predicted && expected) tp++; else if (predicted) fp++; else if (expected) fn++; else tn++;
  }
  return { tp, fp, tn, fn, evaluated: tp + fp + tn + fn, unavailable, ambiguous,
    precision: { numerator: tp, denominator: tp + fp, value: tp + fp ? tp / (tp + fp) : null },
    recall: { numerator: tp, denominator: tp + fn, value: tp + fn ? tp / (tp + fn) : null } };
};
export const metrics = (rows: CaseRow[], authenticatedModel = false) => {
  const strata = [...new Set(rows.map((r) => r.providerPair))].sort();
  return Object.fromEntries(strata.map((stratum) => {
    const sample = rows.filter((r) => r.providerPair === stratum);
    const positiveCross = sample.filter((r) => r.scored && r.productAction === "merge_if_admitted");
    const needed = positiveCross.filter((r) => !r.retrieval.deterministicTogether);
    return [stratum, {
      selectedCases: sample.length,
      retrievalRecall: { denominator: needed.length, numerator: needed.filter((r) => r.retrieval.candidate).length,
        definition: "scored cross-provider same-event pairs requiring a verifier (deterministic together excluded)" },
      deterministicPositiveCoverage: { denominator: positiveCross.length,
        numerator: positiveCross.filter((r) => r.retrieval.deterministicTogether).length },
      modelConditional: confusion(sample, (r) => authenticatedModel ? r.model : null, (r) => r.semanticRelation === "same_story"),
      confidenceGateRejections: sample.filter((r) => r.gate === "rejected_below_confidence").length,
      postRelationContract: confusion(sample, (r) => r.relationTogether, (r) => r.productAction === "merge_if_admitted"),
      publicationContract: confusion(sample, (r) => r.publicationTogether, (r) => r.productAction === "merge_if_admitted"),
    }];
  }));
};
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const mdCell = (text: string): string => text.replaceAll("|", "\\|").replace(/\s+/g, " ");
export const writeReport = (dir: string, data: Dataset, rows: CaseRow[], mode: string,
  requestCount: number, clusters: unknown[]): void => {
  const totals = {
    cases: rows.length, posts: data.posts.length, blocks: data.blocks.length,
    scored: rows.filter((r) => r.scored).length,
    ambiguous: rows.filter((r) => !r.scored).length,
    crossProviderPositives: rows.filter((r) => r.productAction === "merge_if_admitted").length,
    candidateCases: rows.filter((r) => r.retrieval.candidate).length,
    deterministicTogether: rows.filter((r) => r.retrieval.deterministicTogether).length,
    modelDecisions: mode === "LIVE_IMPORTED" ? rows.filter((r) => r.model !== null).length : 0,
    normalizedRegressionDecisions: mode === "OFFLINE_CAPTURED_REGRESSION" ? rows.filter((r) => r.model !== null).length : 0,
    promotedUniquePosts: new Set(rows.flatMap((r) => r.posts).filter((p) => p.selected).map((p) => p.ref)).size,
  };
  const result = { schemaVersion: 1, mode, liveStatus: mode === "LIVE_IMPORTED" ? "IMPORTED_ATTESTED" : "NOT_RUN",
    sourceRevision: data.seal.sourceRevision, labelSealSha256: data.labelSealSha256,
    totals, requestCount, metrics: metrics(rows, mode === "LIVE_IMPORTED"), cases: rows, clusterCases: clusters };
  const validate = new Ajv().compile(readJson<object>("scripts/evals/reader-story-grouping/report.schema.json"));
  check(validate(result), `Invalid report schema: ${JSON.stringify(validate.errors)}`);
  writeFileSync(join(dir, "results.json"), JSON.stringify(result, null, 2) + "\n");
  const intro = `# Проверка группировки реальных постов\n\nРежим: **${mode}**. Live: **${result.liveStatus}**. ` +
    `Выбрано ${totals.cases} пар, ${totals.posts} публичных постов, ${totals.scored} scored и ${totals.ambiguous} ambiguous; ` +
    `${totals.crossProviderPositives} cross-provider same-event positives. Семь дней: 30 августа — 5 сентября 2026 UTC.\n\n` +
    (mode === "OFFLINE_CAPTURED_REGRESSION" ? `Технический regression: все ответы механически false. Это не ответы модели.\n\n` : "") +
    `Это целевая выборка сложных примеров, не оценка точности на популяции. Контексты — 12 замороженных тематических блоков; ` +
    `посты и исходные observedAt сохранены. Не воспроизведён поиск/ранжирование всей ленты за семь дней.\n\n` +
    `AI участвует после retrieval. Production adapter запрашивает sameStory и confidence; порог 0.92. ` +
    `До AI есть детерминированные объединения. После AI действуют guards, all-member проверка кластера, admission и редакционные лимиты. ` +
    `related_topic — отдельная направленная нетранзитивная мета-связь, а не разрешение склеить истории.\n\n` +
    `В этих блоках до AI объединены ${totals.deterministicTogether} размеченных пар; в shortlist попали ${totals.candidateCases}. ` +
    `Подготовлено ${requestCount} канонических запросов Sol/high. Аутентифицированных live-решений в отчёте: ${totals.modelDecisions}.\n\n` +
    `В frozen replay 42 из 49 выбранных постов отклонены в том числе с engagement_unauthoritative; один пост допущен. ` +
    `Недостающую authority мы не выдумываем и не меняем observedAt. Это ограничение входных данных, а не ошибка модели. ` +
    `Остальные причины admission сохранены отдельно. Publication confusion отражает также допуск; её нельзя читать как semantic precision/recall.\n\n` +
    `Из 15 cross-provider positives пять относятся к одному релизу Fable/Mythos и пропущены retrieval; десять найдены, в том числе пять уже объединены детерминированно. В shortlist нет scored negatives, поэтому live-фаза не измеряет specificity на трудных отрицательных парах.\n\n` +
    `Метки сопоставляют смысл утверждений, не удостоверяют их фактическую истинность. Один аналитик, без независимой второй разметки. ` +
    `Только заголовки и спорная гранулярность исключены из gold. Full sourceText прочитан; выдержки ниже короче, полный текст в posts.jsonl.\n\n` +
    `Source: ${data.seal.sourceRevision}; label seal: ${data.labelSealSha256}.\n\n`;
  const matrix = "## Метрики по provider pair\n\n" + Object.entries(result.metrics).map(([name, m]) =>
    `- ${name}: retrieval ${m.retrievalRecall.numerator}/${m.retrievalRecall.denominator}; ` +
    `model TP/FP/TN/FN=${m.modelConditional.tp}/${m.modelConditional.fp}/${m.modelConditional.tn}/${m.modelConditional.fn}, ` +
    `нет решения=${m.modelConditional.unavailable}; contract до promotion ` +
    `${m.postRelationContract.tp}/${m.postRelationContract.fp}/${m.postRelationContract.tn}/${m.postRelationContract.fn}.`,
  ).join("\n") + "\n\nПолные числители/знаменатели precision и recall, admission и cluster membership: results.json. `0/0` означает отсутствие наблюдений.\n\n";
  const header = "## Конкретные пары\n\n| ID | Ожидание: смысл / действие | Retrieval | AI / gate | Cluster / publication | Причина | Источники UTC |\n|---|---|---|---|---|---|---|\n";
  const lines = rows.map((r) => `| ${r.id} | ${r.semanticRelation} / ${r.productAction} | ${r.retrieval.reason} | ` +
    `${r.model === null ? "NOT_RUN / NOT_REQUESTED" : r.model} / ${r.gate} | ${r.relationTogether} / ${r.publicationTogether} | ` +
    `${mdCell(r.rationaleRu)} Фактическая причина: ${mdCell(r.modelRationale ?? r.retrieval.reason)}. | ${r.posts.map((p, i) => `[${i + 1}](${p.url}) ${p.publishedAt}`).join("; ")} |`).join("\n");
  writeFileSync(join(dir, "report.md"), intro + matrix + header + lines + "\n");
  const cards = rows.map((r) => `<article><h2>${r.id}: ${escapeHtml(r.semanticRelation)} → ${escapeHtml(r.productAction)}</h2>` +
    `<p>${escapeHtml(r.rationaleRu)}</p><p>Retrieval: ${r.retrieval.reason}; AI: ${r.model ?? "NOT_RUN / NOT_REQUESTED"}; ` +
    `gate: ${r.gate}; cluster: ${r.relationTogether}; publication: ${r.publicationTogether}.</p>` +
    `<p>Причина verifier: ${escapeHtml(r.modelRationale ?? "Нет ответа")}</p>` +
    r.posts.map((p) => `<p><a href="${escapeHtml(p.url)}" rel="noreferrer">${escapeHtml(p.title)}</a><br>` +
      `${p.publishedAt}; observed ${p.observedAt}</p><blockquote>${escapeHtml(p.excerpt)}</blockquote>` +
      `<small>evidence SHA256 ${p.evidenceSha256}; admission ${escapeHtml(JSON.stringify(p.admission))}</small>`).join("") + "</article>").join("\n");
  writeFileSync(join(dir, "report.html"), `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Real story grouping</title>` +
    `<style>body{font:16px/1.5 system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#172332}article{border-top:1px solid #bbb;margin-top:2rem}blockquote{white-space:pre-wrap;background:#f4f6f8;padding:1rem}small{overflow-wrap:anywhere}pre{white-space:pre-wrap}</style>` +
    `<h1>Проверка группировки реальных постов</h1><pre>${escapeHtml(intro.replace(/^# .*\n/, "") + matrix)}</pre>${cards}</html>`);
};
