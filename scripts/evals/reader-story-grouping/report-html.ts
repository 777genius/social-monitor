import type { CaseRow } from "./replay";
import type { ReportResult } from "./report";

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// Public snippets may contain Markdown emphasis/code. Escape first; never accept embedded HTML.
const inlineText = (value: string): string => escapeHtml(value)
  .replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
const json = (value: unknown): string => `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
const relationRu = {
  same_story: "Одно событие", related_topic: "Общая тема, разные события",
  unrelated: "Разные истории", ambiguous: "Спорная пара — без оценки",
};
const actionRu = {
  merge_if_admitted: "Объединить, если оба поста допущены",
  keep_separate: "Оставить отдельно", unscored: "Не оценивать",
};
const retrievalRu: Record<string, string> = {
  retrieved: "Пара отобрана для проверки",
  already_deterministic_cluster: "Уже объединена правилами",
  same_provider_family_policy_exclusion: "Один тип источника: правила исключают проверку этой пары",
  context_or_capacity_miss: "Не найдена в блоке; отдельно находится. Конкретная причина лимита не установлена",
  lexical_or_title_retrieval_miss: "Не найдена по тексту или заголовку, в том числе при проверке отдельно",
  guard_or_title_retrieval_miss: "Не прошла ограничения отбора или сопоставление заголовков, в том числе отдельно",
};
const sourceLink = (url: string, title: string): string => {
  // Frozen public text is untrusted even in a local report.
  if (!/^https?:\/\//i.test(url)) return inlineText(title);
  return `<a href="${escapeHtml(url)}" rel="noreferrer noopener">${inlineText(title)}</a>`;
};
const modelRu = (row: CaseRow, mode: string): string => {
  if (mode === "OFFLINE_DETERMINISTIC_NO_VERIFIER") return "Модель не запускалась";
  if (row.model === null) return row.retrieval.candidate ? "Ответ отсутствует" : "Пара не запрашивалась";
  const verdict = row.model ? "одно событие" : "разные события";
  return mode === "LIVE_IMPORTED" ? `Ответ модели: ${verdict}` : `Тестовый ответ: ${verdict} (не модель)`;
};
const pairCard = (row: CaseRow, mode: string): string => `<article class="pair" id="${escapeHtml(row.id)}">
  <h3>${escapeHtml(row.id)} · ${relationRu[row.semanticRelation]}</h3>
  <div class="comparison">
    <div><h4>Ожидание</h4><p>${actionRu[row.productAction]}</p><p>${inlineText(row.rationaleRu)}</p></div>
    <div><h4>Результат</h4><p>${escapeHtml(retrievalRu[row.retrieval.reason] ?? row.retrieval.reason)}.</p>
      <p>${escapeHtml(modelRu(row, mode))}.</p>
      <p>После группировки: <strong>${row.relationTogether ? "вместе" : "отдельно"}</strong>.<br>
      В публикации: <strong>${row.publicationTogether ? "вместе" : "нет общей опубликованной истории"}</strong>.</p></div>
  </div>
  <div class="posts">${row.posts.map((p, index) => `<section>
    <h4>Источник ${index + 1}</h4><p>${sourceLink(p.url, p.title)}</p>
    <p class="muted"><time datetime="${escapeHtml(p.publishedAt)}">${escapeHtml(p.publishedAt.replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC"))}</time></p>
    <blockquote>${inlineText(p.excerpt)}</blockquote>
  </section>`).join("")}</div>
  <details><summary>Подробности проверки и допуска</summary>
    <p>Обоснование ответа: ${inlineText(row.modelRationale ?? "Ответ не получен")}</p>
    ${json({ scored: row.scored, retrieval: row.retrieval, confidence: row.confidence, gate: row.gate,
      posts: row.posts.map((post) => ({ ref: post.ref, observedAt: post.observedAt,
        evidenceSha256: post.evidenceSha256, sourceTextSha256: post.sourceTextSha256,
        admission: post.admission, selected: post.selected, editorialReasons: post.editorialReasons })) })}
  </details>
</article>`;

type Matrix = ReportResult["metrics"][string]["modelConditional"];
const fraction = (value: Matrix["precision"]): string =>
  `${value.numerator}/${value.denominator}${value.value === null ? " — нет наблюдений" : ` (${(value.value * 100).toFixed(1)}%)`}`;
const matrix = (title: string, m: Matrix): string => `<section class="matrix"><h4>${escapeHtml(title)}</h4>
  <p>TP / FP / TN / FN: <strong>${m.tp} / ${m.fp} / ${m.tn} / ${m.fn}</strong></p>
  <p>Оценено: ${m.evaluated}; нет решения: ${m.unavailable}; спорных: ${m.ambiguous}.</p>
  <p>Точность объединений (precision): ${fraction(m.precision)}.<br>Полнота (recall): ${fraction(m.recall)}.</p></section>`;
const metricDetails = (result: ReportResult): string => Object.entries(result.metrics).map(([provider, m]) =>
  `<details class="metric"><summary>${escapeHtml(provider)} · ${m.selectedCases} пар</summary>
  <p>Отбор пар, которым нужна проверка: ${m.retrievalRecall.numerator}/${m.retrievalRecall.denominator}.
  Уже объединённые правилами положительные пары исключены из этого знаменателя.</p>
  <p>Положительные пары, объединённые правилами: ${m.deterministicPositiveCoverage.numerator}/${m.deterministicPositiveCoverage.denominator}.
  Отклонено по уверенности: ${m.confidenceGateRejections}.</p>
  ${matrix("Ответы реальной модели — только запрошенные и оценённые пары", m.modelConditional)}
  ${matrix("Группировка до допуска к публикации", m.postRelationContract)}
  ${matrix("Общая публикация с учётом допуска и лимитов", m.publicationContract)}</details>`,
).join("");

export const renderHtml = (result: ReportResult): string => {
  const t = result.totals;
  const live = result.mode === "LIVE_IMPORTED";
  const receipt = {
    schemaVersion: result.schemaVersion, mode: result.mode, liveStatus: result.liveStatus,
    evaluatedSource: result.evaluatedSource, captureSourceRevision: result.captureSourceRevision,
    manifestSha256: result.manifestSha256, labelSealSha256: result.labelSealSha256,
    replaySha256: result.replaySha256, captureSha256: result.captureSha256, ownedFiles: result.ownedFiles,
  };
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Как группируются реальные посты — проверка</title>
<style>
*{box-sizing:border-box;min-width:0}
body{font:16px/1.55 system-ui,sans-serif;color:#172332;background:#fff;max-width:1100px;margin:0 auto;padding:16px;overflow-wrap:anywhere}
h1{font-size:clamp(1.65rem,4vw,2.3rem);line-height:1.2;margin:16px 0}h2{font-size:1.4rem;margin:28px 0 12px}h3{font-size:1.15rem;margin:0 0 12px}h4{font-size:1rem;margin:10px 0}
p{margin:8px 0}a{color:#0754a3;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #0754a3;outline-offset:3px}
.status{border:2px solid #946100;background:#fff5d9;padding:14px;border-radius:8px}.status strong{display:block;font-size:1.15rem}
.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin:16px 0}
.counts div{padding:12px;background:#eff4f8;border-radius:8px}.counts dt{font-size:1.65rem;font-weight:700}.counts dd{margin:0}
.muted{color:#485668;font-size:.9rem}.pair{border:1px solid #cbd4dd;border-radius:8px;padding:16px;margin:16px 0}
.comparison,.posts{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}.comparison>div{background:#f4f7fa;padding:12px;border-radius:6px}
blockquote{margin:8px 0;padding:12px;border-left:3px solid #bdcbd8;background:#f6f8fa;white-space:pre-wrap}
details{margin:12px 0}summary{cursor:pointer;padding:10px 0;font-weight:600}.metric{border-top:1px solid #cbd4dd}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;font-size:.85rem;background:#f4f7fa;padding:12px}
.matrix{border-left:3px solid #cbd4dd;padding-left:12px;margin:16px 0}
@media(min-width:700px){.comparison,.posts{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><main>
<header><p class="muted">30 августа — 5 сентября 2026 · семь дней · UTC</p>
<h1>Как группируются реальные посты</h1>
<div class="status"><strong>Live: ${escapeHtml(result.liveStatus)} — ${live ? "импортированы подтверждённые ответы" : "модель не запускалась"}</strong>
<p>Реальных ответов модели: ${t.liveResponses}. ${live ? `Решений по размеченным парам: ${t.modelDecisions}.` : "Качество модели по этому запуску не оценено."}</p>
${result.mode === "OFFLINE_CAPTURED_REGRESSION" ? `<p>Сохранённые тестовые ответы проверяют обработку результатов. Это техническая проверка без модели.</p>` : ""}</div>
<dl class="counts"><div><dt>${t.cases}</dt><dd>пар · ${t.posts} постов</dd></div>
<div><dt>${t.scored} + ${t.ambiguous}</dt><dd>с оценкой + спорные</dd></div>
<div><dt>${t.retrievedPositives}/${t.crossProviderPositives}</dt><dd>найдено пар об одном событии из разных источников</dd></div>
<div><dt>${t.missingAuthorityPosts}/${t.posts}</dt><dd>без подтверждённых показателей вовлечённости</dd></div></dl></header>
<section aria-labelledby="findings"><h2 id="findings">Что показала проверка</h2>
<p>Среди ${t.retrievedPositives} найденных положительных пар ${t.deterministicRetrievedPositives} уже объединены правилами.
До проверки ответов правила объединили ${t.deterministicTogether} размеченных пар.</p>
<p>Пропуски по одному анонсу Fable/Mythos: <strong>${t.fableAnnouncementMisses}</strong>.
Это связанные примеры одного события, а не независимые ошибки на разных темах.</p>
<p>Подготовлено ${result.requestCount} запросов на ${t.requestedPairs} пар. Среди них ${t.candidateCases} размеченных пар;
отрицательных с оценкой — ${t.shortlistedScoredNegatives}. ${t.shortlistedScoredNegatives === 0 ? "Проверить способность модели различать трудные отрицательные примеры по этим запросам нельзя." : "Метрики модели ниже учитывают только реальные полученные ответы."}</p>
<p>Допущено постов: ${t.admittedUniquePosts}; выбрано для публикации: ${t.promotedUniquePosts}.
Отсутствующие подтверждённые показатели не восстановлены. Допуск и редакционные лимиты влияют на публикацию отдельно от группировки.</p></section>
<section aria-labelledby="limits"><h2 id="limits">Границы выводов</h2>
<p>Это ${t.blocks} специально выбранных блоков сложных примеров. Результат не оценивает всю ленту или общую точность модели.
Поиск и ранжирование всех постов за семь дней не воспроизведены; сохранены исходные тексты и время наблюдения.</p>
<p>Метки описывают смысл утверждений, а не подтверждают их истинность. Разметку выполнил один аналитик без независимой второй проверки.
Примеры с одними заголовками и спорным уровнем детализации не оцениваются.</p>
<p>Общая тема сама по себе не означает одно событие. Объединение историй, ответ модели и общая публикация показаны отдельно.</p></section>
<details><summary>Метрики по сочетаниям источников: все числители и знаменатели</summary>
<p>TP — верное объединение; FP — ошибочное; TN — верное разделение; FN — пропущенное объединение.
Для модели цель — одно событие; для группировки и публикации — действие из разметки. Дробь 0/0 означает отсутствие наблюдений.</p>
${metricDetails(result)}</details>
<section aria-labelledby="pairs"><h2 id="pairs">Ожидание и результат: ${t.cases} пар</h2>
<p>Заголовки ведут к оригинальным публикациям. Ниже — короткие выдержки; при разметке прочитаны полные доступные тексты.</p>
${result.cases.map((row) => pairCard(row, result.mode)).join("\n")}</section>
<details><summary>Технические сведения: проверенный код и неизменность данных</summary>
<p>Проверен чистый коммит ${escapeHtml(result.evaluatedSource.revision)}.
Источник замороженных постов и меток хранится отдельно: ${escapeHtml(result.captureSourceRevision)}.</p>
<p>Полные результаты, допуск, исходные и итоговые кластеры, обратный порядок входов и все метрики: <a href="results.json">results.json</a>.
Точные запросы без вызова модели: <a href="requests.json">requests.json</a>.</p>${json(receipt)}</details>
</main></body></html>\n`;
};
