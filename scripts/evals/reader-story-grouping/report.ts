import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { readJson, check } from "./dataset";
import type { Dataset } from "./dataset";
import type { CaseRow } from "./replay";
import type { RequestManifest } from "./requests";
import { renderHtml } from "./report-html";

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
const mdCell = (text: string): string => text.replaceAll("|", "\\|").replace(/\s+/g, " ");
export const buildReport = (data: Dataset, rows: CaseRow[], mode: string,
  manifest: RequestManifest, clusters: unknown[]) => {
  const positives = rows.filter((r) => r.scored && r.productAction === "merge_if_admitted");
  const uniquePosts = [...new Map(rows.flatMap((r) => r.posts).map((p) => [p.ref, p])).values()];
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
    requestedPairs: manifest.requests.reduce((n, r) => n + r.candidateCount, 0),
    liveResponses: mode === "LIVE_IMPORTED" ? manifest.requests.length : 0,
    retrievedPositives: positives.filter((r) => r.retrieval.candidate).length,
    deterministicRetrievedPositives: positives.filter((r) => r.retrieval.candidate && r.retrieval.deterministicTogether).length,
    fableAnnouncementMisses: positives.filter((r) => r.blockId === "fable-release" && !r.retrieval.candidate).length,
    shortlistedScoredNegatives: rows.filter((r) => r.scored && r.semanticRelation !== "same_story" && r.retrieval.candidate).length,
    missingAuthorityPosts: uniquePosts.filter((p) => p.admission && !p.admission.admitted &&
      p.admission.reasons.includes("engagement_unauthoritative")).length,
    admittedUniquePosts: uniquePosts.filter((p) => p.admission?.admitted).length,
  };
  return { schemaVersion: 2, mode, liveStatus: mode === "LIVE_IMPORTED" ? "IMPORTED_ATTESTED" : "NOT_RUN",
    captureSourceRevision: manifest.captureSourceRevision, evaluatedSource: manifest.evaluatedSource,
    manifestSha256: canonicalJsonSha256(manifest), ownedFiles: manifest.ownedFiles,
    labelSealSha256: data.labelSealSha256, replaySha256: manifest.replaySha256, captureSha256: manifest.captureSha256,
    totals, requestCount: manifest.requests.length, metrics: metrics(rows, mode === "LIVE_IMPORTED"), cases: rows, clusterCases: clusters };
};
export type ReportResult = ReturnType<typeof buildReport>;

export const writeReport = (dir: string, data: Dataset, rows: CaseRow[], mode: string,
  manifest: RequestManifest, clusters: unknown[]): void => {
  const result = buildReport(data, rows, mode, manifest, clusters);
  const { totals, requestCount } = result;
  const validate = new Ajv().compile(readJson<object>("scripts/evals/reader-story-grouping/report.schema.json"));
  check(validate(result), `Invalid report schema: ${JSON.stringify(validate.errors)}`);
  writeFileSync(join(dir, "results.json"), JSON.stringify(result, null, 2) + "\n");
  const intro = `# Проверка группировки реальных постов\n\nРежим: **${mode}**. Live: **${result.liveStatus}**. ` +
    `Выбрано ${totals.cases} пар из ${totals.posts} публичных постов: ${totals.scored} с оценкой, ${totals.ambiguous} спорные. ` +
    `Период: 30 августа — 5 сентября 2026 UTC.\n\n` +
    (mode === "OFFLINE_CAPTURED_REGRESSION" ? `Техническая проверка с сохранёнными тестовыми ответами; это не ответы модели.\n\n` : "") +
    `Найдено ${totals.retrievedPositives}/${totals.crossProviderPositives} пар об одном событии из разных источников; ` +
    `среди найденных ${totals.deterministicRetrievedPositives} уже объединены правилами. ` +
    `Пропуски одного анонса Fable/Mythos: ${totals.fableAnnouncementMisses}; они взаимосвязаны.\n\n` +
    `Подготовлено ${requestCount} запросов на ${totals.requestedPairs} пар; размеченных среди них ${totals.candidateCases}. ` +
    `Реальных ответов модели: ${totals.liveResponses}; решений по размеченным парам: ${totals.modelDecisions}.\n\n` +
    `У ${totals.missingAuthorityPosts}/${totals.posts} постов нет подтверждённых показателей вовлечённости. ` +
    `Допущено постов: ${totals.admittedUniquePosts}; выбрано для публикации: ${totals.promotedUniquePosts}. ` +
    `Результат публикации учитывает допуск и редакционные лимиты, поэтому не измеряет качество модели.\n\n` +
    `Это целевая выборка сложных примеров в ${totals.blocks} блоках, не оценка всей ленты. ` +
    `Поиск и ранжирование всех постов за семь дней не воспроизведены; исходные тексты и время наблюдения сохранены. ` +
    `Отрицательных размеченных пар среди запросов: ${totals.shortlistedScoredNegatives}. При нуле нельзя оценить, как модель различает трудные отрицательные примеры.\n\n` +
    `Метки сопоставляют смысл утверждений, не удостоверяют их фактическую истинность. Один аналитик, без независимой второй разметки. ` +
    `Примеры с одними заголовками и спорным уровнем детализации не оцениваются. Полные доступные тексты прочитаны при разметке; в карточках — выдержки.\n\n` +
    `Проверенный коммит: ${manifest.evaluatedSource.revision} (чистое дерево ${manifest.evaluatedSource.treeSha}). ` +
    `Источник замороженных данных: ${manifest.captureSourceRevision}; печать меток: ${data.labelSealSha256}.\n\n`;
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
  writeFileSync(join(dir, "report.html"), renderHtml(result));
};
