# Jev как основной оценщик Social Monitor: план реализации

Дата: 2026-09-20. Изученный HEAD: `0e9704324a673d83d938ae970c4b2b14fc8bb637`.

Редакция 3: применён `777genius-workflow:plan-improve`; уточнены транзакционные переходы, publication guard, retention и границы schema versions. Нормативные слова: «обязательно» входит в приёмку; «отложено» не реализовывать в этой задаче. Числовые defaults ниже являются стартовой конфигурацией, а не обещанием производительности. Изменение бизнес-правил требует явного изменения этого документа; имена приватных классов и разбиение файлов исполнитель выбирает по правилам репозитория.

## 1. Задача и границы

Документ предназначен агенту реализации, которому история обсуждения неизвестна. Цель: быстрее выпускать содержательные подборки с простой, проверяемой логикой; Jev оценивает каждый собранный пост по нескольким критериям, БД сохраняет результат, код сортирует. Старый рейтинг сохраняется для отката. Полезность для читателя важнее популярности.

Текущий запрос пользователя разрешает исследование и подготовку этого плана. В этой задаче не выполняются реализация, миграция production, переключение режима или публикация. После передачи агенту реализации выполнять согласованный scope; разрешение на выпуск получать отдельно по правилам проекта.

Обязательный MVP:

- Четыре оценки Jev и их версии в БД для всех собранных уникальных постов в активных интересах, включая низкопопулярные и не попавшие в Top.
- Повторное использование оценок без новых API-вызовов при перестановке критериев сортировки.
- Сбор доступного текста в ingestion; сохранение текста отдельно от короткого preview.
- Простой новый selector без прежних semantic/popularity floors.
- Сохранение проверки заголовков, цитат, принадлежности данных и исторической воспроизводимости.
- Поддержка новой версии публикации в backend/API/frontend без изменения старых публикаций.
- Небольшое сравнение качества на реальных постах как часть реализации, затем обратимый rollout. Не продолжать бесконечную серию исследовательских спайков вместо внедрения.

Не входят: research-агент, crawler, обязательный второй оценщик качества всех постов, векторная БД, обучение модели, универсальный feature store, новый orchestration framework, UI-конструктор весов, массовая загрузка комментариев, OCR, браузерная загрузка сайтов, обход paywall.

### 1.1. Закрытый scope реализации

| ID | Обязательный результат | Граница: что не делать |
| --- | --- | --- |
| S1 | Один OpenRouter System One adapter, четыре критерия, versioned input/rubric, сохранённые assessments | Другие модели/поставщики, пятый критерий, ensemble, автоматический prompt tuning |
| S2 | Оценка сохранённых FeedItem + SourceItem активного interest через существующий worker; cache/retry/leases и bounded очистка этой cache-таблицы | Смена provider search/top-N, оценка несохранённой выдачи, отдельный сервис, брокер, scheduler framework, общий privacy/retention engine |
| S3 | HN external URL, сохранение enriched body, bounded retry включая RSS 304, Atom XHTML, provenance, согласованные caps | X thread/quote expansion, GitHub README, PDF/OCR, JS/browser fetch, обход paywall, backfill статей за всю историю |
| S4 | HTTP-ограничения article/RSS на тех же изменяемых путях | Глобальная переделка всех HTTP adapters и собственной DNS/proxy-платформы |
| S5 | V3 admission/comparator/dedup, preparation manifest, отдельный headline/evidence этап | Веса/суммарный magic score, pairwise LLM ranking, новый story-clustering алгоритм, переписывание V2 |
| S6 | Вложенные promotion V3/schema/DTO/generated clients/Flutter verifier, wired publication guard; сохранённые V1/V2 читаются | Смена внешнего artifact/report/proof envelope без необходимости, новый экран, бейджи, настройки сортировки, публичный assessment endpoint, изменение истории публикаций |
| S7 | Один фиксированный quality comparison, rollout/rollback инструкция и focused checks | Бесконечные спайки, новый dashboard, автоматический production rollout |

«Каждый пост» здесь означает каждую текущую версию сохранённого FeedItem поддерживаемого типа в разрешённом workspace/активном interest и окне `backfillFrom`: X original post, Reddit post, HN story, RSS article, GitHub radar repository и уже существующий FeedItem GitHub trending. Для trending оценка тоже сохраняется, но не управляет его appendix placement и не блокирует social Top. Комментарии/ConversationUnit не являются отдельными единицами scoring; unknown provider/kind учитывается как `unsupported_kind`, не маскируется под noise. X replies/quotes как новые типы Top не добавлять. Результаты разных interests не переиспользовать друг для друга даже при одинаковом тексте; разные FeedItem одного интереса с тем же SourceItem используют один assessment key, без новой сетевой оценки.

Окончание этой реализации - code-ready: S1-S7, миграции и проверки готовы, измерения сохранены, default legacy. Product-ready V3 дополнительно требует успешного quality comparison. Production-enabled требует отдельного разрешения выпуска. Провал качества не означает, что нужно скрыть измерения, расширить scope или отключить защиту публикаций.

### 1.2. Границы архитектуры и свобода исполнителя

Relevance владеет rubric/input/assessment/reuse и контрактом scorer; ingestion владеет capture и обновлением source; summary владеет frozen preparation, отбором для публикации и headline/evidence; composition связывает adapters/config. Summary не пишет напрямую в assessment-таблицу, ingestion не импортирует Jev, frontend не вызывает модель. Нужны узкие контракты между этими владельцами, но не interface/repository на каждое поле и не параллельная копия всего pipeline.

Допустимы локальные extraction/refactor для этих границ, необходимые FK/index/migration и generated contracts. Не чинить соседние подсистемы без воспроизводимого дефекта на S1-S7. Если найден конфликт с фактическим кодом, сначала зафиксировать конкретное несоответствие и минимальное изменение плана; не выбирать молча другой admission, окно, fallback или UX. Независимые части реализации продолжать. Правила репозитория и новые указания пользователя имеют приоритет.

### 1.3. Риски, зависимости и предел уверенности

| Проверяемое допущение | Что известно / что должен доказать исполнитель |
| --- | --- |
| Jev улучшает редакционную ценность | Скорость/цена и повторяемость измерены; превосходство подтверждает только фиксированный comparison §12 |
| Current source достаточно для historical replay | Неверно после обновления body; нужен retained snapshot нужного cutoff, иначе typed unavailable |
| PostgreSQL транзакции и роли позволяют новые guards | В repository есть optional/fallback capabilities; V3 требует реальную transaction capability и scoped privileges, доказываемые sandbox integration |
| Production имеет выключатель публикации | Не подтверждено: default publication provider не передаёт существующий optional guard; требуются wiring и отмена exact job (§13) |
| Retention-contract автоматически удалит snapshots | Неверно: существующий privacy use case составляет план; targeted executable cleanup входит в S2 (§7.3) |
| Все consumers одинаково понимают V3 | Не предполагать: нужен один producer-to-SQL-to-API-to-Flutter fixture; внешние envelopes остаются прежними (§11) |
| Byte caps гарантируют runtime speed/token fit | Это safety limits; actual token budget, peak memory, whole-path latency и число replicas проверяются до activation |

Начинать от актуального согласованного base, сравнив затрагиваемый код с изученным SHA. При изменении entry points обновить карту, не восстанавливать старый код поверх чужой работы. Secret delivery, разрешённый scoped corpus, PostgreSQL sandbox и работающий hosted text-generation runtime нужны для соответствующих integration/eval этапов; их отсутствие не блокирует независимые pure policy/storage изменения. Локальных тяжёлых сборок и runtime-проверок на реальных проектах не выполнять.

## 2. Что уже доказано и что не доказано

Прочитать:

- `docs/reports/2026-09-20-jev-real-post-spike.md`;
- `docs/reports/2026-09-20-jev-primary-scorer-confirmation-spike.md`;
- `scripts/evals/reader-value-primary-scorer/README.md`, `run-jev.swift`, `selection-policy.mjs`, `safe-results.json`;
- `docs/plans/2026-09-20-jev-real-post-spike-handoff.md` для проверенных инструкций доступа.

R2: 440 уникальных постов, 8 дней, 1 065 вызовов, $0.060826; первый полный проход $0.024650; p50 387 мс, p95 588 мс, 91.524 с при concurrency=2. Ориентир $0.056/1 000 постов относится только к Jev при прежней длине входа. С более полным текстом цену измерить заново. Генерация заголовков/саммари сюда не входит.

438/440 повторяемых admission и одинаковый порядок 6/8 дневных Top доказывают повторяемость, не точность. Слепой независимой разметки нет; 60 выбранных B-simple против 44 сохранённых старых Top не являются честным paired benchmark. Экспертный просмотр предполагает улучшение, но не подтверждает заявляемую precision/recall.

Базовый R2 включает RSS в экспериментальный selector; production V2 RSS в social Top не поддерживает. Не ограничиваться заменой одного adapter и не считать результаты спайка уже совместимыми с production.

Этот документ заменяет архитектурные предложения раннего `2026-09-20-reader-value-ranking-and-jev-spike.md`, в частности сохранение popularity floors как постоянной части нового рейтинга. Исторические отчёты и runner не переписывать.

## 3. Зафиксированные решения

1. Jev отвечает за semantic assessment. Его четыре категории являются исходными данными, не финальным порядком публикации.
2. Новый scorer не реализует старый `SourceContentQualityReviewerPort`: тот также несёт evidence/headline contract. Ввести узкий контракт `ReaderValueScorer` во внутреннем слое relevance.
3. Результаты хранятся в отдельной tenant-scoped таблице. Успешная оценка неизменяема; изменение входа/рубрики создаёт новую версию.
4. Для фоновой оценки использовать существующий `intelligence-worker` и небольшой DB-backed batch use case. Новые сервисы, брокер и распределённая платформа не нужны.
5. В ingestion переиспользовать имеющийся Readability extractor; исправлять конкретные потери текста. Не ходить по ссылкам во время сортировки или генерации саммари.
6. Генератор заголовка/evidence вызывается после Jev для ограниченного списка потенциальных лидеров; его старые quality scores не должны снова определять допуск.
7. Новая ranking policy и новые подписываемые структуры получают V3. Нельзя присвоить Jev-полезность старому `qualityScore` или выдать новый порядок за V2.
8. Начальная сортировка V3: `usefulness DESC, relevance DESC, publishedAt DESC, candidateId ASC`. ASCII/bytewise сравнение ID, без locale-dependent comparator.
9. Отличие от R2: raw popularity убрана из межпровайдерного tie-break. Лайки X и points HN несопоставимы. Оставить их для отображения/диагностики. Это осознанное упрощение, проверить его в финальном offline comparison. Не писать comparator, который сравнивает популярность только для пары из одной сети: такой comparator может быть нетранзитивным.
10. Все настройки выбора стратегии фиксируются в начале job. Один job не может смешать V2/V3 после изменения runtime config.

Существующие безопасные границы сохраняются: tenant/workspace, актуальный interest, тип и идентичность источника, ограничения времени, блокировка опасного содержимого/URL, проверка цитат, дедупликация, лимиты подборки. Содержательные эвристики вроде `promo_offer` и `needs_link_context` не являются техническими safety-инвариантами.

## 4. Карта текущего кода и необходимые изменения

| Поверхность | Сейчас | Изменение для V3 |
| --- | --- | --- |
| `libs/ingestion/features/execute-scan/execute-scan.use-case.ts` | fetch -> candidate memory -> enrichment -> source persistence -> feed projection | Сохранить место enrichment; исправить потери/повторяемость, не вызывать Jev внутри scan lease |
| `libs/ingestion/adapters/enrichment/` | ArticleContentSourceItemEnrichmentAdapter + HTTP Readability | Переиспользовать, исправить диагностику полноты и обнаруженные bounded-fetch дефекты |
| `libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository.ts` | MVCC promotion snapshot + source body | Новый inventory для V3 до legacy eligibility; сохранить согласованный cutoff и snapshot |
| `libs/feed/domain/policies/feed-promotion-eligibility.ts` | Тип источника и обязательность engagement связаны; RSS исключён | Разделить source identity/kind eligibility и необязательный engagement; V2 не менять |
| `libs/relevance/features/rank-feed-items/promotion-assessment-eligibility.ts` | Старые flags/floors до модели | Обойти только в V3; не ограничивать Jev прежним списком admitted |
| `libs/relevance/features/rank-feed-items/promotion-content-assessment.ts` | max 200, popularity-prioritized batches, quality + headline | Не использовать как scheduler массового Jev-scoring; оставить legacy path |
| `libs/relevance/features/rank-feed-items/rank-promotion-snapshot.ts` | 12 000 UTF-16 body, 2 000 title, quality merge | Выделить V3 strategy с чтением сохранённых оценок и отдельной подготовкой presentation |
| `libs/relevance/domain/source-content-quality*.ts` | Эвристические штрафы и пороги | В V3 не применять их к semantic admission и порядку; V2 сохраняется |
| `libs/relevance/adapters/model/promotion-review-wire.ts` | Одновременно score, evidence, headline | Переиспользовать проверенные части в узком presentation contract |
| `libs/summary/adapters/evidence/reader-summary-editorial-slate.ts` | V2 comparator, representatives, topQualified-first, diversity | V3 selector, единый comparator для representative/refill/Top/Additional |
| `libs/summary/domain/services/reader-post-promotion-*` | Повторные admission/projection/attestation проверки V2 | V3 dispatch по версии; legacy поля не подделывать |
| `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-schema.ts` | Строгая V2 schema и digests | Поддержать V3 рядом с прежними схемами |
| `libs/summary/adapters/persistence/prisma/prisma-reader-summary-publication.ts` и `libs/summary/interfaces/rest/summary-reader-summary-publication.provider.ts` | Optional transaction guard; default wiring его не передаёт | Обязательный guard для V3 внутри той же Serializable transaction, реальный SQL publication round-trip |
| `libs/summary/interfaces/rest/reader-summary-promotion-attestation.dto.ts` | V1/V2 enums + numeric score components | Версионированный V3 DTO с semantic assessment, без фиктивных V2 scores |
| `apps/frontend/features/summaries/lib/src/infrastructure/anti_corruption/` | Строгий verifier V2 | Отдельная ветка V3, старые проверки сохранить |

Не переносить весь текущий ranking в новый пакет и не дублировать весь summary pipeline. Strategy меняет только источник оценок, admission и comparator; общие неизменные проверки/сборку переиспользовать.

## 5. Полный текст при сборе

### 5.1. Уже известные факты

- `ArticleContentSourceItemEnrichmentAdapter` подключён в `apps/ingestion-worker/src/article-content-enrichment.module.ts` и `execute-scan.module.ts`.
- Default providers: Reddit, HN, RSS; максимум 20 items за scan, последовательная обработка.
- `HttpReadabilityArticleContentExtractor`: 10 секунд на fetch, до 3 redirects, 1.5 MB body, минимум 300 и максимум 30 000 символов текста.
- Для нового capture поднять extraction cap с 30 000 до 64 000 UTF-16 и записывать длину нормализованного текста до ограничения, сохранённую длину и truncation. Native segment сохраняется отдельно и не сокращается ради статьи. Успешный complete presentation возможен, когда native + article + разделители суммарно укладываются в 64 000 UTF-16; превышение честно остаётся неподдержанным полным presentation, а не незаметной обрезкой. Проверить статью 40 000 символов с небольшим native segment: extraction не обрезает её, presentation получает целиком. Общий storage safety cap 256 000 не повышать.
- Reddit URL для статьи берётся из `metadata.linkedUrl`; RSS использует canonical URL. Подтверждённый дефект HN: статья лежит в `metadata.externalUrl`, но extractor берёт discussion canonical URL и поэтому пропускает её.
- `source_items.body` хранит тело; короткий `feed_items.body_preview` предназначен для ленты. Promotion snapshot уже умеет брать source body.
- Даже сохранённый текст позже режется до 12 000 UTF-16 в старом reviewer. `assessPromotionReaderHeadline` отклоняет `availability=truncated`. Поэтому увеличение полноты ingestion без изменения presentation input может не увеличить итоговый Top.
- Уже есть провайдерные comment enrichment paths. Комментарии не равны исходному посту/статье; не склеивать их без attribution.

### 5.2. Контракт полноты

Под полным текстом понимается доступный оригинальный текст поста и, где предусмотрено, доступный текст одной связанной статьи. Не обещать получение закрытых, JS-only, image-only, удалённых материалов или всех комментариев.

Сохранять в source metadata версионированное `contentCapture`: native/article origin, fetchedAt, extractionVersion, source/final URL identity, исходную/сохранённую длину, truncation flag, outcome и фиксированный reason code. Полнота захвата и `contextSufficiency` Jev различаются: полный короткий пост может содержать мало информации.

Для внешней статьи сохранять разделение оригинального тела и статьи. Минимум: явные границы сегментов с offset/length и URL/provenance в metadata; не дублировать text в metadata, если он уже в body. Любые quotes привязываются к тому же сохранённому text representation. Для старых объединённых body отметить `legacy_combined`, не выдумывать точные границы.

Внести в первый content checkpoint только доказанные исправления: правильный external URL HN, устранение потери при persistence/update, корректный retry незавершённого enrichment, отсутствие бесконечного повторного fetch уже успешно сохранённого текста. RSS уже предпочитает `content:encoded`/Atom content; не переписывать работающий выбор. Исправить вложенный Atom XHTML отдельной небольшой регрессией. Не менять успешный source snapshot из-за нового неудачного fetch.

Конкретная политика обновления source:

1. Native revision считать до enrichment и независимо от fetchedAt/метрик. Отдельно считать effective content revision после добавления статьи. Не использовать нынешний `providerContentHash`, зависящий от merged body, как доказательство native change.
2. Native revision и article URL прежние, нового extraction success нет: сохранить прежний article segment и его successful provenance; обновить только новые native facts/метрики и статус попытки отдельно.
3. Native revision изменился, article URL прежний: обновить original segment, явно сохранить reused article с прежним fetchedAt; не представлять его как заново проверенную статью. В MVP успешная статья автоматически не refetch-ится по возрасту или новым лайкам; её неизвестная актуальность видна по fetchedAt. Новый URL либо явный существующий operator refresh разрешает новую попытку. Новый refresh endpoint/таймер не создавать.
4. Article URL сменился: прежнюю статью не переносить к новой ссылке. В effective body оставить новый native text до успешного fetch.
5. New extraction success меняет article segment, effective body, metadata, exact hash и contentUpdatedAt согласованно. Body-only update запрещён. Новый snapshot вызывает новую оценку Jev.
6. Legacy combined body без надёжных сегментов не разбирать по произвольному вхождению строки `Article text:`. До следующего успешного capture сохранять старый rich body при неизменном native input, если это можно доказать memory/source binding; иначе обозначить unknown provenance и не заявлять строгий reuse.

Для due enrichment достаточно targeted query по сохранённым source items/metadata внутри существующего scan workflow: pending/budget-skipped/transient-failed, тот же source binding и URL. Выполнять даже если RSS вернул 304/empty batch. Сохранять attemptCount, nextAttemptAt, URL/revision binding; до 3 сетевых попыток на binding/revision, budget skip попыткой не считается. Permanent unsupported/paywall/invalid URL не циклировать. Новое содержимое/URL или explicit operator refresh создаёт новую opportunity. Processed state candidate memory не означает успешную загрузку статьи.

### 5.3. Ограничения fetch

- Переиспользовать существующий extractor, не Swift-fetch из спайка как production implementation.
- Общий deadline на всю extraction, включая redirects и body read; timeout не обнуляется на каждом redirect. Abort/cancel при превышении размера, ошибки парсинга изолированы на item. Общий enrichment budget завершать до истечения scan lease с запасом для persistence; lease expiry само по себе не отменяет HTTP.
- Один известный article URL; разрешённые HTTP(S), проверка outbound URL каждого перехода. Аудит обнаружил отсутствие DNS/private-IP/rebinding защиты: закрыть её до расширения fetch. Проверять все A/AAAA и фактическое соединение, не делать отдельный DNS precheck с последующим повторным resolution у fetch. Общий infrastructure transport для article/RSS оправдан двумя существующими consumers; domain URL policy остаётся чистой. Проверить IPv6 link-local /10, multicast /8 и IP-mapped representations.
- RSS client сейчас следует redirects автоматически и проверяет final URL после запроса, а body читает без byte cap. Для него тоже нужны manual guarded redirects, bound/cancel body и общий deadline. Не расширять исправление на все сетевые adapters проекта.
- Никаких cookies/Authorization исходного provider, секретов или переноса correlation/request identifiers на произвольные сайты без необходимости.
- Нативный полный текст имеет приоритет; не fetch повторно ради дублирования уже полного RSS body.
- Дедуплицировать exact article request identity внутри batch одного tenant/workspace/source binding. Persistent reuse только у того же SourceItem/source binding, без общего межисточникового article cache.
- Сохранять budget-exhausted отдельно от permanently-unavailable. Повтор не должен навсегда подавляться candidate memory.
- Не увеличивать 20 до бесконечности. Считать 20 реальных extraction attempts, а не первые 20 позиций, включая неподходящие URL. Использовать bounded due-items revisit, не отдельного research-worker.
- Фоновый scorer видит финальный доступный snapshot; успешное позднее дополнение меняет его версию и ставит новую оценку. Саммари ничего не дозагружает.

Подробные провайдерные findings и границы runtime verification приведены в приложении A. X quote/thread и GitHub README расширение отложены; не включать их в цену первого content checkpoint.

### 5.4. Однозначные capture cases

| Случай | Обязательное поведение |
| --- | --- |
| HN link story | Только валидный `metadata.externalUrl`; canonical HN discussion URL и provider item ID не менять |
| HN Ask/Show без externalUrl | Сохранить native text; не загружать discussion page как статью |
| Reddit | Только `metadata.linkedUrl` вне discussion hosts; selftext сохранить; не искать произвольную первую ссылку в body |
| RSS | Native content/summary по существующему приоритету, включая XHTML. Skip article fetch только при explicit complete capture; само имя content:encoded и длина не доказывают полноту |
| Native и article совпали | Удалять дублирование только при exact равенстве нормализованных сегментов; не выбрасывать native по substring/includes. Provenance обоих origin сохранить |
| URL изменился/исчез | Старый article не прикреплять к новому native snapshot. Старые assessment inputs остаются историческими версиями |
| Native не изменился, метрики изменились | Сохранить article и source revision; не вызывать Jev повторно |
| Старый combined body неизвестного происхождения | Пометить legacy_combined; не разрезать по текстовому маркеру и не выдавать предположение за verified full capture |
| HTTP 429/408/5xx, timeout/network | До 3 dispatch attempts; retry через 1 и 5 минут, для 429 не раньше валидного Retry-After. Нет попытки внутри той же extraction |
| HTTP 401/403/404/410, private/invalid URL, non-HTML/paywall/empty extraction | Permanent unavailable для URL/revision. Native text остаётся доступным Jev; недоступная статья не считается noise |
| Scan budget/RSS 304 | Budget skip не расходует attempt; due query всё равно выполняется при 304. До 20 actual network attempts совместно для новых и due items, общий deadline 60 s либо оставшийся scan lease минус 10 s, если меньше |
| Отложенная старая попытка завершилась после новой версии | CAS по source/native revision + article URL + scan fence отклоняет устаревшее обновление; старый body не восстанавливается поверх нового |

Article request identity строится через стандартный URL parser: lowercase scheme/host, default port normalization, fragment исключить; path case, percent-encoded path и query parameters/их порядок не упрощать, tracking-параметры не удалять. URL с userinfo запрещён. Requested URL и проверенный final URL сохраняются отдельно; redirects не меняют provider canonical identity. Reuse требует того же extraction representation version. Для одинакового текста сохранять earliest proven capture/available-at; время повторной проверки хранить отдельно. Новый recipient после batch reuse получает собственный acquiredAt, не чужой старый timestamp. Для merged body available-at = максимум availability его native/article сегментов. Нельзя задним числом считать поздно присоединённую статью доступной раньше.

Extraction deadline 10 s на все redirects + body, HTML body не более 1 500 000 bytes; эти лимиты не сбрасываются при redirect. RSS feed получает отдельный maxBytes=5 MiB с тем же bounded read/redirect механизмом; размер не наследуется от 64k extracted-text cap. Readability/JSDOM не исполняет scripts и не подгружает ресурсы. «Complete» означает отсутствие известного усечения доступного представления, а не доказательство, что сайт отдал всё своё содержимое.

## 6. Вход и рубрика Jev

### 6.1. Вход

Нормализованный внутренний `ReaderValueInput` содержит scope/IDs, title, captured text, capture availability/provenance, trusted interest query и версию редакционной инструкции. Для wire отделить trusted policy от untrusted title/body. Не отправлять engagement, старые scores, прежнее попадание в Top, авторитетность бренда как подсказку полезности.

Универсальная редакционная инструкция: полезно то, что помогает читателю что-то сделать, понять или решить в рамках его интереса. Не навязывать всем interests профиль AI-разработчика; использовать уже сохранённый interest. Новый профиль пользователя и его LLM-генерация не нужны.

Полный текст хранится в source независимо от ограничения модели. Builder детерминированный и версионированный; сохраняет exact input и truncation. Не использовать preview при наличии source body.

До model truncation считать `sourceSnapshotSha256` по exact title/body и каноническому представлению стабильной provenance: identity/URL сегментов, их границы, полнота и extraction representation version. Изменение текста за пределами отправленного Jev excerpt тоже меняет identity оценки. Не включать в этот digest время повторного fetch, engagement или состояние попытки, если текст и его смысловая provenance прежние; время доступности сохранять отдельно и проверять для исторического cutoff. При превышении storage cap считать digest полного доступного исходника до обрезки, а retained snapshot помечать truncated/non-replayable для полного presentation.

Для стартового Jev request установить консервативный ceiling: `state + longest question` не более 28 000 UTF-8 bytes, полный request без credentials не более 56 000 bytes. Это консервативная инженерная граница под опубликованные 32k/64k token limits, не утверждение о точном token count OpenRouter. Сначала резервировать место для title/interest/questions, затем текста. Не разрывать Unicode символы. Слишком длинный interest/instructions - configuration error, не молчаливая обрезка смысла.

Если source длиннее бюджета, сохранять явный `modelInputTruncated=true`, исходную длину, digest исходного и отправленного текста. Недостаток контекста не равен `noise`. Не вводить chunking/map-reduce или автоматическое summary-before-scoring в MVP.

Wire contract: один post, один request с четырьмя questions (`usefulness`, `relevance`, `context_sufficiency`, `evidence_basis`). IDs/scope остаются во внутренней обвязке; API получает trusted interest, untrusted title/source_text и стабильную capture completeness. Timestamps fetch/attempt, лайки, прежние labels и текущий Top не отправлять. После полного title и фиксированных instructions текст сокращается детерминированным Unicode-safe prefix до byte budget; whitespace/отрицания/цифры после capture не переписывать. Title сверх 2 000 UTF-16 также явно сокращается и даёт inputTruncated; full source digest включает исходный title. Пустые title+body - permanent `empty_input`, без API; только title либо только body допускаются. Для русского/английского текста нет дополнительного перевода.

### 6.2. Четыре независимых вопроса

| Поле | Категории | Использование |
| --- | --- | --- |
| usefulness | noise, context, useful, important, insufficient_context | Основной admission и порядок |
| relevance | unrelated, adjacent, relevant, central, insufficient_context | Admission и второй ключ |
| contextSufficiency | insufficient, partial, sufficient | Диагностика/отображение, не hard gate |
| evidenceBasis | observation, described_data, linked_claim, unsupported_claim, no_claim, insufficient_context | Характер видимой опоры, не проверка истинности |

Сохранить для каждого поля choice, probabilities по всем разрешённым labels и confidence. Это модельная неопределённость, не доказанная точность на нашем корпусе. Пока не вводить confidence threshold или сортировку по confidence.

Рубрика `reader-value.v1` использует R2.1 как основу с кратким уточнением:

- Существование списка/инструмента/курса и наличие цифр сами по себе не обеспечивают useful.
- Практическая возможность, содержательное сравнение, метод, ограничение, измеренный результат, воспроизводимый баг и урок инцидента могут обеспечить useful.
- Рекламная подача не отменяет конкретного полезного вклада; краткий релиз не обязан содержать benchmark.
- Обычная эмоция/жалоба без переносимого вывода не становится useful из-за соответствия теме.
- Important требует значимого последствия для интереса и достаточной видимой опоры; громкая формулировка/бренд не заменяют её.
- Не предполагать содержимое ссылок, независимое подтверждение или новизну относительно истории, которой нет во входе.

Добавить максимум 4 коротких пары положительных/отрицательных примеров разных типов. Не зашивать списки известных хороших/плохих брендов или конкретных постов из test set. Финальный hash рубрики фиксируется до holdout evaluation. Если уточнение не улучшает контрольную выборку, выпускать измеренный R2.1 как отдельную явную rubric version; не добавлять всё новые правила вслепую.

### 6.3. API adapter

- Проверенный endpoint OpenRouter: `POST https://openrouter.ai/api/v1/systemone`.
- Проверенный request model: `typesafe/jev-1.13`; resolved model R2: `typesafe/jev-1.13-20260917`, provider TypeSafe.
- Не считать response model ID автоматически допустимым request ID. Если полный versioned ID OpenRouter не подтверждён, использовать проверенный alias + allowlist ожидаемого resolved ID. При смене resolved ID прекратить принятие новых результатов этой конфигурацией и сигнализировать `model_version_changed`.
- Native `fetch`, имеющиеся HTTP/security helpers; новый SDK не требуется. Config и secret приходят из composition root.
- Проверить точный набор questions/labels, finite numbers, диапазон 0..1, сумму probabilities с документированным tolerance, response model/provider, лимит response body. Нельзя доверять type-safety поставщика вместо проверки transport.
- Одна запись входа на вызов; concurrency=2 как измеренная отправная точка. Настройки bounded и явно передаются adapter.
- Request timeout 30 s; до 3 попыток на assessment version, 429 учитывать Retry-After, 5xx/network повторять ограниченно. 401/403 и schema/model mismatch не повторять в цикле на каждом посте.
- Timeout может быть оплачен; хранить `usageUnknown`, missing cost не заменять нулём. Exactly-once внешнего API не обещать; уникальность принятого результата обеспечить в БД.
- Токены не попадают в argv/logs/source/DB assessment payload. Для production использовать существующий secret delivery; macOS Keychain не является secret-store контейнера.

Response body максимум 256 KiB. Набор questions и probability labels ровно из §6.2; tolerance суммы `abs(sum - 1) <= 0.02` как в R2. Выбор категории берётся из валидного `choice`, не вычисляется заново через argmax/округление/confidence. Probability tie и choice не равный argmax принимаются как ответ provider с diagnostic flag; confidence хранится как provider-reported значение, без предположения, что оно равно probability(choice) или эмпирической точности. Unknown label, missing question, NaN, неверный model/provider - весь assessment invalid; частичные четыре поля не сохранять как success. Новые служебные envelope fields можно игнорировать, а не запрещать расширение provider API целиком. Отсутствующие usage/cost при корректных answers не уничтожают оценку: сохранить null и unknown usage; это диагностический дефект учёта, не noise.

## 7. БД: одна оценка на конкретный вход и интерес

### 7.1. Таблица `reader_value_assessments`

Владелец: bounded context relevance. Название не привязывать к Jev навсегда. Добавить Prisma model, migration, RLS, composite scope FK/unique/indexes и retention integration по действующим правилам проекта.

| Группа | Поля |
| --- | --- |
| Identity | id, tenantId, workspaceId, interestId, sourceItemId; FeedItem binding через существующую scoped связь |
| Version binding | sourceRevisionKey, sourceSnapshotSha256, interestSha256, rubricVersion, rubricSha256, inputBuilderVersion, modelConfigVersion, inputSha256 |
| Input custody | bounded private sanitized source/input snapshot, capture metadata, exact request bytes digest; фактически доступный моделям text/interest для replay под текущими retention/access rules |
| State | pending, running, assessed, retryable_failed, permanent_failed; attempts, nextAttemptAt, leaseUntil, leaseToken, errorCode; createdAt, expiresAt |
| Result | usefulness, relevance, contextSufficiency, evidenceBasis; distributions/confidence в bounded versioned JSON |
| Execution | requestedModel, resolvedModel, provider, requestId, assessedAt, latencyMs, inputTokens, outputTokens, costUsd nullable, usageUnknown |

Не хранить только общий score. `insufficient_context` - валидная категория assessed, а не failure. Для технической ошибки result fields остаются null. Для любого API/read model различать `not_assessed`, `pending`, `failed`, `assessed`, `stale`.

Уникальность результата: `(tenantId, workspaceId, interestId, sourceItemId, sourceSnapshotSha256, inputSha256, rubricSha256, modelConfigVersion)`. `sourceSnapshotSha256` обязателен в ключе независимо от model truncation. В inputSha включить все реально влияющие отправленные title/text/availability/trusted inputs и inputBuilderVersion; sourceItem/interest scope тоже проверить независимо. Exact request-bytes digest хранить отдельно от source digest. Нормализованный article fingerprint, удаляющий пунктуацию/числа/URL, не годится вместо exact hash.

`rankingPolicyVersion`, число лайков, Top limit и пользовательская сортировка не входят в cache key. Новый criterion, изменённый текст, interest или модель требуют новой оценки. Новый comparator не требует.

При concurrent insert/claim уникальный ключ выбирает одну работу. Только владелец действующего lease может завершить row. После `assessed` результат immutable; поздний ответ проигравшей/просроченной попытки не затирает его. Нельзя удерживать транзакцию/row lock на время HTTP.

Начальный lease 90 s покрывает один 30 s HTTP attempt и guarded persistence; retries назначаются отдельными attempts через nextAttemptAt. При неясном результате DB-write сначала повторно читать exact key, не отправлять новый HTTP вслепую. Foreign keys проверяют tenant/workspace/source и tenant/workspace/interest, а не только UUID; FeedItem определяется scoped join по interest/source и проверяется при каждом read. Не делать cache row зависимой от случайно первого FeedItem дубля. При необходимости добавить scoped unique constraint в связанной таблице.

Source snapshot нужен потому, что `source_items.body` изменяемый. Один hash без сохранённого входа не позволяет воспроизвести оценку или проверить исторические quotes. Предел private snapshot 256 000 UTF-16 для body совпадает с текущей safety-boundary; превышение явно маркировать, не считать полным. Не заводить отдельную общую content-versioning платформу.

Индексы: scoped lookup exact key; runnable `(state,nextAttemptAt,leaseUntil)` с scope; batch lookup по scoped feedItemIds; current-version discovery по source revision/interest/config. Дополнительные индексы динамической сортировки создавать после конкретного запроса/EXPLAIN, не на каждую комбинацию критериев.

### 7.2. Переходы assessment и учёт попыток

| Исходное состояние/событие | Результат |
| --- | --- |
| Exact key отсутствует | Insert pending, input immutable с момента insert; duplicate insert читает существующую row |
| pending/retryable_failed due, attempts < 3 | Atomic claim -> running с уникальным leaseToken, leaseUntil; один claim = одна зарезервированная attempt, increment до HTTP |
| Валидный ответ, действующий token/lease | assessed, все четыре результата записываются атомарно |
| Retryable transport error, attempts < 3 | retryable_failed; nextAttemptAt через 10 s после первой/60 s после второй попытки, 429 не раньше Retry-After |
| Retry budget исчерпан | permanent_failed с transport/retry_exhausted code; нового automatic reset при следующем discovery нет |
| running lease истёк / процесс упал | Старый ответ не принимается. Сначала reread row; assessed не трогать. Иначе reserved attempt считать израсходованной/usageUnknown, назначить retry либо exhausted |
| Schema/alias/provider mismatch, 400/404 API | permanent_failed с отдельным code и остановка новых dispatch этого model/config в процессе; остальные rows не помечать noise или failed пачкой |
| 401/402/403 API | retryable_failed в пределах 3 attempts и fatal pause процесса; после исправления доступа и явного restart повторить тот же input, без автоматического probe/смены semantic cache key |
| Scope удалён/отключён во время запроса | Result не публиковать/не применять, pending work не claim-ить; deletion policy имеет приоритет над сохранением diagnostic input |

Retry-After поддерживает seconds и HTTP-date; отсутствующий/невалидный header использует указанный backoff. Далёкую корректную дату не сокращать для обхода rate limit: row остаётся due позже, summary может завершиться по своему deadline. HTTP attempts только из assessment loop; hidden HTTP retries adapter/SDK отключены. Не обещать exactly-once provider billing при crash между claim/send/save.

В той же row хранить bounded attempt diagnostics до 3 записей: ordinal, requestId если известен, sent/finished times, known cost и usageUnknown. Итоговая известная стоимость складывается по attempts, unknown flag не сбрасывается поздним успехом. LeaseToken проверяется при любой записи. Для DB timeout после ответа сначала read exact key и guarded сохранение того же результата, пока lease жив; повторный HTTP ради неизвестного статуса записи запрещён.

Concurrency=2 на процесс; не добавлять distributed rate-limiter. При rollout явно фиксировать число worker replicas и суммарный concurrency. Fatal pause выдаёт health signal, требует исправления config/secret и явного рестарта worker, не timer-based бесконечного probe; каждая реплика прекращает dispatch после первого замеченного fatal ответа. Уже отправленный второй запрос может завершиться. Успешные старые rows переиспользуются; смена только secret/worker replica count не меняет semantic cache key.

### 7.3. Удаление и исторические публикации

Добавить policy для `reader_value_assessments` в `ops/privacy/retention-contract.json`: owner relevance, derived reader-value cache, retentionDays=180, exportable=false для внутреннего model-input cache, legalHoldAware=true, deleteMode=`hard_delete_after_expiry`. Это согласовано с текущим 180-day source/feed горизонтом. `PlanRetentionPurgeUseCase` только рассчитывает планы: регистрация policy не является реализацией очистки.

Добавить одну targeted repository operation очистки assessments, вызывать из existing intelligence-worker раз в 60 s, до 100 rows за tick, scoped transaction с DB timeout. Она работает и при legacy mode/fatal scoring pause; новые daemon/queue/privacy framework не нужны. `expiresAt = min(assessment.createdAt + 180 days, source.createdAt + 180 days)`; cache hit/retry не продлевает expiry. Inventory не создаёт заново expired operational input за пределом retention, чтобы purge не запускал вечный платный rescore. Исторический запрос такого материала получает unavailable либо использует уже опубликованный immutable artifact.

Источники решений для cleanup:

- Age и scope binding берутся из БД, не из provider timestamps. Обычный purge пропускает живой assessment lease и ссылки активного REQUESTED preparation/RUNNING job. Истечение preparation deadline само по себе не снимает pin: поздний preflight обязан сначала проверить результаты, принятые вовремя (§8.1). Истечение execution lease также не доказывает завершение неизвестной генерации. Stale job даёт deferred_active_job + health signal; pin снимается после durable terminal outcome через preflight либо существующее reconciliation/отмену (§13.2). Это явное временное исключение retention, требующее операционного разбора, а не скрытое бессрочное хранение или автоматический повтор model calls.
- Manifest freeze и purge сериализуются на тех же assessment rows: freeze получает scoped shared locks и проверяет полный набор exact keys в своей короткой transaction; purge получает update locks, повторно проверяет ссылки и удаляет. Если purge успел первым, freeze не публикует dangling manifest, а возвращает snapshot_unavailable. Не связывать вечный artifact обязательным FK с cache row.
- Для MVP authoritative legal-hold scope задаётся существующим operational retention triage и передаётся composition как versioned `retentionHoldWorkspaceIds`. Hold консервативно распространяется на весь workspace; неизвестная/невалидная конфигурация означает skip + health signal. Изменение hold применяется остановкой cleanup на всех replicas, обновлением config и restart; состояние считается применённым после подтверждения всех replicas. Новую legal-hold БД/UI и hot-reload платформу не создавать. До release записать фактический источник этой config и её hash, не выдавать отсутствие проверки за пустой список holds.
- Source tombstone/удаление interest/workspace требует отдельного очистительного прохода по сохранившимся assessment inputs: FK cascade при физическом DELETE недостаточен. Сразу запретить read/dispatch; очистить по действующему решению privacy triage. Обязательное стирание имеет приоритет над job pin; legal hold обрабатывается по явному retention решению и не даёт доступа к скрытым данным. Нет обхода hold через обычный TTL path.

Cleanup outcomes: deleted/deferred_active_job/deferred_hold/deferred_unknown_policy/failure; counters без текста. Existing publication хранит безопасный immutable snapshot оценок/digests, поэтому удаление cache row не ломает старое чтение. Scope-erasure и опубликованные artifacts по-прежнему подчиняются существующей publication graph policy; эту задачу не расширять в общую автоматизацию удаления графа.

## 8. Как оценивать каждый пост без замедления ingestion

`Collect -> enrich -> persist source/feed -> background assess -> persist criteria -> summary selection`.

Нужен один `AssessReaderValueBatchUseCase` и loop в существующем intelligence-worker, по образцу `RelevanceMemoryProjectionLoop`. Новая очередь не требуется: assessment rows и source/feed inventory являются durable источником работы.

1. Включённый scope берётся из активных interests/workspaces и runtime policy. На rollout задать точный allowlist workspace и начальный `backfillFrom`; не запускать безграничный backfill всей истории.
2. Inventory читает все сохранённые собранные посты определённых в §1.1 типов в этом scope до legacy promotion gates. Hidden/deleted/banned source исключаются явно. Appendix-only GitHub тоже оценивается без изменения размещения. Это не обещание оценки всех результатов внешнего поиска: provider top-N/quotas/rejection cache действуют раньше. Их причины измерить, но не переписывать одновременно X Python ranking и все collection policies; отдельный recall checkpoint при доказанных потерях.
3. Pagination ограниченная, по стабильному ключу; revisions обнаруживаются и при изменении старого поста, interest/config. Успешный cursor только по createdAt без обработки updates неприемлем. Если source сохранён, но FeedItem отсутствует вследствие projection defect, сначала восстановить штатную projection, а не silently считать его оценённым. Для первой версии inventory unit - scoped FeedItem + exact SourceItem; это соответствует interest-specific смыслу оценки.
4. Начальные defaults: tick 10 s, до 100 discovered rows за tick, HTTP concurrency=2. Остаток остаётся в inventory/таблице, не пропадает по лимиту 200/60 s старого reviewer.
5. Scheduler выдаёт работу по `nextAttemptAt/firstSeen/id`, не по популярности. Несколько workspace обходятся справедливо. Неудачные items не занимают всю страницу и не блокируют следующие.
6. При обнаружении версии insert pending row с exact snapshot; runnable rows claim короткой транзакцией/lease, затем HTTP вне транзакции, guarded completion. Restart/retry не теряет очередь. Model/config-specific fatal failure приостанавливает новые вызовы этого режима и даёт health signal вместо тысяч одинаковых 401.
7. Успешная новая версия source/interest образует новую assessment identity. Старый успешный result не считается current для изменённого входа. Exact source/input hashes являются проверкой reuse; отдельный dirty marker в MVP не вводится.
8. Summary job фиксирует inventory и набор assessment versions перед выбором. Незавершённый coverage обслуживается явным preflight из §8.1: job остаётся REQUESTED, existing poller возобновляет проверку по deadline. Существующего pending/deferred summary state нет; не ссылаться на него и не вызывать модели из GET или фронтовой сортировки.
9. Для первого включения требовать обработанное frozen окно: все требуемые assessments имеют assessed, включая валидные noise/insufficient_context. Exhausted/invalid assessments завершают подготовку typed failure, а не `no_signal` или частичным Top. Уже опубликованную подборку сохранять.

MVP discovery - повторяемый bounded keyset sweep по существующему scoped FeedItem inventory, без отдельного dirty-event механизма. Внутри разрешённого окна keyset `(publishedAt, feedItemId)`; цикл обязательно начинается снова после конца, поэтому старые rows с изменённым body и новым config не теряются. FeedItem/source читать согласованно на каждой странице; перед reuse проверять exact digests, а не только createdAt. Cursor и round-robin position scopes можно держать в памяти: restart начинает sweep заново, durable assessment rows предотвращают повторные API calls. До 100 rows за tick суммарно, по 25 на scope за один проход round-robin; у одного scope можно использовать оставшийся budget. Нет skip failed pages с продвижением cursor без фиксации причины/следующей попытки.

Sweep не обещает оценку каждой промежуточной редакции, которую успели перезаписать между ticks: оценивается обнаруженная текущая версия, а все уже сохранённые assessment inputs immutable. Обновление старого поста обнаруживается не позднее следующего полного sweep при работающем worker; время sweep/backlog измерить. Новый input builder/config охватывает тот же backfill window. Непривязанные к active frozen job устаревшие pending versions можно не dispatch-ить; их cleanup выполняет retention, а current version остаётся runnable. Preflight вправе idempotently подготовить missing inputs своего окна, не ждать обхода всей истории. Добавлять отдельную таблицу cursors/outbox/event bus для этого не требуется.

Историческая доступность относится к source snapshot: native/article capturedAt и входящая в оценку версия текста должны быть доступны к ingestionCutoff. Сам assessedAt может быть позже cutoff, поскольку обработка исторического текста не является future leakage. Текст статьи, загруженный сегодня, нельзя приписать прежнему дню. Если подходящего сохранённого snapshot нет, исторический replay помечается невоспроизводимым; current body с ранним observedAt не является заменой.

### 8.1. Конкретный bounded preflight для summary job

Сейчас `ReaderSummaryJob` имеет requested/running/completed/no_signal/failed/quality_rejected. `ReaderSummaryJobPollingLoop` выбирает только REQUESTED; queue drain повторяет только shutdown/backpressure. Claim умеет FAILED, но сам по себе не планирует повтор. Поэтому добавить небольшой preflight перед execution claim в существующем `ExecuteReaderSummaryJobUseCase`, без нового публичного job status и новой очереди.

1. В summary-owned `ReaderSummaryJob` добавить nullable `selectionStrategy`, `preparationConfig` (private versioned JSON: interest snapshot/hash, rubric/input/model config bindings без secret), `preparationManifest` (versioned private JSON), `preparationManifestSha256`, `preparationCutoffAt`, `preparationDeadlineAt`, `preparationNextCheckAt`, `preparationReadyAt`, `terminalFailureCode`. Первый CAS фиксирует strategy, preparationConfig, cutoff и deadline; готовый manifest записывается отдельно write-once. Existing running/terminal jobs трактовать как legacy, до включения writers миграция additive. Strategy/config не меняются при resume/retry; отсутствие нужной закреплённой config даёт config_unavailable, а не silent latest fallback.
2. Существующий promotion snapshot использует READ ONLY transaction: не писать через него в assessments/job. Порядок: (a) согласованно прочитать V3 inventory/source через scoped read-only snapshot; (b) через relevance contract idempotently сохранить exact input rows небольшими batches вне reader transaction; (c) коротким summary CAS сохранить manifest, только когда все его exact keys существуют. Manifest содержит cutoff, interest/config digests, candidate identities, assessment keys/source digests, frozen publishedAt/source-kind/identity и уже доступные story relations. Текст принадлежит assessment input rows и не дублируется. При конкуренции проигравший читает winner manifest; лишние idempotent input rows допустимы и очищаются штатной retention. При crash до freeze повторить подготовку с тем же cutoff/deadline; если нужная историческая версия уже недоступна, terminal failure вместо подстановки нового body. После freeze inventory больше не пересобирать.
3. Сохранить текущие defensive ceilings: 100 000 scanned physical rows и 1 000 supported promotion candidates на summary; manifest максимум 4 MiB, суммарный материализованный source text максимум 32 MiB UTF-8. Проверять byte lengths до загрузки больших body. Не повышать нынешний лимит 1 000 до 10 000 в этой задаче. Превышение даёт `assessment_inventory_over_budget`, без выбора первых N. Background scoring продолжает охватывать все posts независимо от этого summary limit. Snapshot/history недоступны к cutoff - `assessment_snapshot_unavailable`. Retention не удаляет input rows активного preparation/running job, кроме обязательного удаления scope/данных.
4. Сохранить deadline `firstPreparationAt + 15 min`; next check через 10 s, не позже deadline. Это ограничение ожидания оценок, не срока model pipeline. Frozen deadline не продлевается после restart или redelivery. Pending/running/retryable rows обслуживает assessment loop из §8; summary preflight только проверяет coverage.
5. Если ещё не готово, сохранить next check и вернуть successful command result со status requested. Queue ACK; не бросать backpressure ради бесконечного requeue. Расширить `findRequested` параметром now и SQL-фильтром due preparation до LIMIT; poller и queue path используют один preflight. Handler/poller metrics учитывают deferred отдельно, не как succeeded/failed. При primary mode обязательны enabled assessment loop и summary poller; composition validation ловит queue-only конфигурацию, которая иначе никогда не продолжила бы ACKed job.
6. Сначала проверить, все ли required rows приняты с `assessedAt <= preparationDeadlineAt`, даже если poller проснулся после deadline. `assessedAt` ставится DB wall clock после получения row lock при guarded UPDATE успешно зафиксированной записи: PostgreSQL `clock_timestamp()`, не transaction-start `now()`, provider response или часы worker. Граница означает время принятия update, не момент получения его ACK; rollback не считается принятием. Если все успели, короткой guarded transaction записать `preparationReadyAt` и выполнить fenced execution claim. При финальном ready/fail решении сериализовать чтение required row states с completion updates короткими shared locks в стабильном порядке; не читать source body и не держать locks на время HTTP. Pipeline получает frozen inventory/exact keys. После ready claim preparation deadline больше не применяется. Повторная доставка не запускает второй pipeline и не меняет вход; automatic retries uncertain paid generation не добавлять.
7. Есть permanent failure, historical snapshot недоступен, либо deadline истёк и условие п.6 не выполнено: atomic CAS REQUESTED -> FAILED с failedAt/reason/`terminalFailureCode` (`assessment_coverage_timeout`, `assessment_unavailable` либо snapshot/over-budget code), без промежуточного RUNNING и без presentation/summary. Для этого добавить узкий domain/repository переход failPreparation: текущий `fail()` разрешает только RUNNING, а `saveExecutionOutcome()` не подходит для REQUESTED. Не распознавать исход парсингом free-text failureReason. Вернуть terminal failed result, queue ACK. Повторные сообщения возвращают сохранённый terminal result; FAILED claim не оживляет его. Новый запрос создаёт новый job/idempotency key. Пустое успешно обработанное окно по-прежнему может дать настоящий no_signal.
8. Добавить узкие repository operations для write-once preparation/CAS, due lookup и terminal fence; обновить mapper/serialization так, чтобы существующие save/retry не очищали manifest. Возобновление после restart опирается на БД. V3 terminalFailureCode для scope_changed/interest_changed/config_unavailable тоже запрещает автоматический reclaim FAILED, включая отказ перед публикацией. Не заимствовать unrelated daily-model recovery или вводить универсальный workflow engine.

Начальный объём/15 min проверить на реальном inventory перед включением: при backlog сначала дождаться фонового backfill, затем создать production summary job. Health/metrics показывают manifest candidate count, assessed/missing, due age и terminal code. Не считать таймаут доказательством низкой полезности постов.

Coverage относится к technically eligible promotion candidates frozen окна, а не ко всем interests/истории и не к GitHub appendix. Failed appendix assessment не блокирует social Top. Empty title+body исключается до required coverage с `empty_input`, сохраняя diagnostic outcome; недостаточный, но непустой текст оценивает Jev. У каждого кандидата проверяются exact source/interest/rubric/model keys; stale success не считается готовностью. Доступная версия текста выбирается по проверенному content available-at <= cutoff; поздний assessedAt допустим. `observedAt` первого появления поста сам по себе не датирует нынешнее тело.

Окно и timezone брать из существующей source-window policy; интервалы [start, end), observed/capture <= cutoff. PostgreSQL timestamps сохранить с исходной микросекундной точностью и сравнивать без округления через JS Date, если это меняет границу/порядок. Invalid timestamp - invalid candidate с диагностикой, не `Date.now()` fallback. Появившиеся после freeze posts попадут в следующий job; новая версия текста не меняет уже замороженный input.

Frozen input не отменяет текущий доступ: перед ready claim и публикацией повторно проверить workspace/interest/source/user block. Удаление/отзыв доступа останавливает job с `scope_changed`, прежний manifest не пересортировывается и private data не восстанавливаются. Обычная правка interest после freeze также даёт `interest_changed` перед публикацией; подготовить новый job отдельно. Переключение runtime strategy влияет только на новые jobs. Старые публикации подчиняются существующему access/deletion policy.

Убрать workspace из rollout allowlist значит не создавать новые Jev jobs, но дать frozen jobs закончиться с их versioned config. Это не равно удалению/деактивации workspace/interest или явному source block. Готовый publication kill switch для этого пути не установлен; отмена exact jobs и V3 guard обязательны по §13. Не менять стратегию уже выполняющегося job на V2.

### 8.2. Контракт интеграции preflight с ExecuteReaderSummaryJob

Один V3 preflight возвращает закрытый union `deferred | claimed | terminal | already_running`. Это описание контракта, не требование новых классов:

- deferred: job остаётся REQUESTED, due time сохранено, queue ACK;
- claimed: возвращает уже сохранённый RUNNING job + exact startedAt fence + frozen manifest; `ExecuteReaderSummaryJob` сразу продолжает pipeline и не вызывает legacy claim второй раз;
- terminal: возвращает persisted failed/completed/no_signal/quality_rejected, без model calls;
- already_running: свежий чужой execution claim, duplicate delivery ACK с running/in-progress metric, без второй генерации.

Каждая запись deferred/freeze проверяет `status=REQUESTED`, frozen config identity и отсутствие ready claim. Поздний pending-handler не может вернуть RUNNING/terminal job в REQUESTED или перезаписать nextCheck после старта. ReadyAt + RUNNING + startedAt пишутся одной transaction/CAS. При потерянном DB ACK перечитать job по scope/id, не создавать новый cutoff и не утверждать владение чужим claim.

V3 transaction capability обязательна в production: helper `runSerializableReaderSummaryTransaction` умеет fallback без `$transaction`, поэтому нельзя считать сам вызов helper доказательством атомарности. В V3 Prisma path отсутствующая transaction capability - configuration failure; in-memory unit adapter остаётся отдельным. Бизнес-слою не передавать PrismaClient; transaction/locks принадлежат реализации порта.

Автоматически восстанавливается REQUESTED preparation и assessment queue. После durable RUNNING crash может означать уже отправленную платную генерацию: stale execution требует существующего evidence/reconciliation пути, а не нового автоматического generation retry. До reconciliation оставить видимый execution outcome unknown и прежнюю публикацию. Не добавлять новый recovery orchestrator ради этого случая; не называть такое состояние успешно восстановленным.

## 9. Selector V3 и старые фильтры

### 9.1. Admission

Semantic admission: `usefulness in {useful,important}` AND `relevance in {relevant,central}`. Context/evidence не hard gates. `insufficient_context` по usefulness/relevance не повышать автоматически: пост остаётся в обычной ленте с этим состоянием, без research escalation. Не заполнять восемь мест noise/context ради числа.

До этого остаются source identity, scope, explicit user/source block, unsafe URL/text и окно публикации/наблюдения. Missing/null/нулевые engagement не блокируют V3. Invalid или conflicting metrics не дают signal; если конфликт относится к самой identity/типу источника, candidate invalid независимо от Jev.

Поддержать HN, Reddit, X original posts и RSS article в одной semantic policy. RSS требует нового provider/content-kind contract во всех перечисленных consumers. GitHub radar оценивается по уже сохранённому описанию через тот же scorer; ограничения собственной trend projection сохраняются. `github-trending-page` остаётся appendix-only, даже при высокой полезности. Не присваивать GitHub фиктивную оценку вместо вызова.

### 9.2. Порядок и дедупликация

- Comparator из раздела 3 применяется при выборе lead каждой story, подборе replacement после неготового headline и итоговом порядке.
- Сохранить существующие same-story relations/dedup. Не выдавать canonical-URL dedup из спайка за эквивалент production.
- Top до 8, Additional до 8. В MVP Additional тоже берётся из semantic-admitted pool.
- Сохранить фактическую текущую provider-cap policy: `min(8, readerPostPromotionTopProviderCap(activeProviderCount))`. Legacy helper намеренно считает audit limit=10: результат для Top-8 равен 8 при одном активном provider, 6 при двух, 4 при трёх и более. Не пересчитывать скрыто от 8 в этой задаче и не давать обязательный первый слот каждой сети. После выбора состав сортируется одним comparator.
- Для RSS добавить provider identity в cap/counting; отсутствующая популярность не заменяется нулём.
- Summary model получает backend-owned ordered slate; не имеет права добавлять/reorder/promote посты.

Порядковые значения usefulness: important=3, useful=2, context=1, noise=0, insufficient_context=-1; relevance: central=3, relevant=2, adjacent=1, unrelated=0, insufficient_context=-1. Unknown enum не получает default rank, а отклоняется схемой. candidateId = сохранённый FeedItem UUID в canonical lowercase representation. publishedAt берётся из frozen authoritative timestamp, не из времени scoring. Никаких confidence/popularity/source-authority дополнительных tie-break.

Детерминированная последовательность: (1) technical eligibility + semantic admission; (2) существующие same-story/canonical relations, без новой модели clustering; (3) единый глобальный порядок кандидатов; (4) bounded presentation из §10.3; (5) лучший display-ready представитель каждой story; (6) activeProviderCount среди полученных представителей, один проход Top с cap; (7) Additional = первые 8 оставшихся представителей по comparator, без дополнительного provider cap. Representative одной story один на Top+Additional; его provider не подменяется ради cap. Если cap мешает заполнить Top, оставить меньше 8, не ослаблять cap и не добавлять noise. Уже имеющийся topic cluster не автоматически same story; разные события на одну тему не схлопывать.

### 9.3. Что обходит V3

Обойти старые popularity floors, `topQualified` от popularity, eligibility по regex-content flags, смешивание deterministic и model score, старые числовые quality/relevance/integrity thresholds как критерии читательской пользы. Проверить не только входной ranker, но и writer validation/support admission: скрытое повторное применение V2 отменит результат Jev.

Не удалять V2 файлы и не менять их поведение. Не передавать придуманные 0.99/1.0 в legacy поля, чтобы пройти проверки. Новая typed V3 assessment должна доходить до publication validator непосредственно.

Точная граница safety: существующий `SourceContentSafetyPolicy`/redaction, scope/block checks, outbound URL policy и headline quote safety сохраняются. `hasHardBlocker` из `source-content-quality-verdict.ts` является содержательной эвристикой (crypto_promo/promo_offer/url_only/tco_only/needs_link_context/media_only_without_context/personal_medical_anecdote), а не технической safety policy; его не переносить в V3 под новым именем. Старый penalty за `safety=sanitized` тоже не влияет на полезность. Весь retained model-facing text проходит existing safety/redaction до обрезки Jev; не ограничивать redaction 280-символьным preview. Состояние blocked/пустой результат после redaction исключает candidate с diagnostic reason.

Assessment custody хранит безопасное представление, а не новый raw provider payload/копию вырезанных secrets. Исходный sourceSnapshotSha256 привязывает оригинальную захваченную версию; отдельные input/presentation digests описывают реально отправленное sanitized представление. Quote offsets проверять по нему, не по исходному body после изменения длины redaction. Sanitizer version входит в inputBuilderVersion; frozen sanitized input обеспечивает replay без восстановления секретов. Уже существующее source storage/retention не расширять ради такого восстановления.

## 10. Заголовки, подтверждения и summary

### 10.1. Почему нельзя просто заменить reviewer

`SourceContentQualityReviewerPort` возвращает `PromotionReviewAssessment`: binding, exact evidence spans, readerHeadline и wholeInput. `assessPromotionReaderHeadline` проверяет snapshot/digest, lengths, offsets/quotes, caveats, confidence, допустимый формат. Далее `displayReadyPromotionCandidates` не допускает лидеров без валидного headline. Jev из спайка возвращает только выбор категорий/вероятности, поэтому не является подстановкой этого контракта.

### 10.2. Минимальная новая граница

Ввести `PromotionPresentationBuilder`: вход - frozen source snapshot + scope + IDs; выход - bound evidence refs + validated headline либо typed unavailable. Реализация использует уже имеющийся agent-runtime text model и существующие quote/headline validators. Runtime adapter/config остаётся на внешней границе; новый framework не нужен.

Для V3 prompt/schema убрать semantic promote/reject и числовые quality scores. Нужны только поддержанный заголовок, оговорки и ссылки на фрагменты. Генератор может отказать из-за отсутствия безопасного формулирования/доказательств, но не из-за малого числа лайков или старого `promo_offer`. Старый reviewer целиком остаётся для V2.

Не добавлять Jev-критерии в инструкцию как основание истинности утверждений. Scorer решает ценность; presentation model формулирует только то, что поддержано текстом. `evidenceBasis=described_data` не является верификацией чисел или независимым источником.

### 10.3. Когда вызывать и сколько

После semantic ranking готовить headlines пакетами по 4, максимум 32 уникальных candidates на job. Брать очередных по глобальному comparator, не более одного ещё не проверенного представителя одной story в batch. Batch полностью завершается до выбора следующего; ответы применяются в исходном порядке, независимо от latency. После успеха одного представителя остальные этой story не проверяются; после content-level unavailable следующий представитель снова участвует в глобальном порядке. Остановиться на 32 попытанных candidates либо исчерпании пула. Не вводить сложную оптимизацию early-stop по уже заполненным 16 местам: окончательная provider-cap policy считается один раз по готовому пулу. В trace показать `presentation_budget_exhausted` для непроверенных; число 32 - capacity limit, не semantic gate.

Если лучший представитель story не получил headline, следующий semantic-admitted представитель может пройти в оставшемся budget. Не уничтожать всю story и не давать дублю отдельный слот. Не подставлять raw title как подтверждённое утверждение. Invalid quote/unsupported phrasing/truncation - content-level unavailable конкретного item; timeout/runtime auth/schema envelope failure - dependency failure всего job, даже если предыдущий batch успел вернуть часть заголовков. Не публиковать случайный subset из-за инфраструктурного сбоя. При semantic-admitted > 0 и нуле display-ready завершать `presentation_unavailable`, не no_signal. При хотя бы одном валидном представителе допустим короткий Top с явными причинами исключения остальных.

### 10.4. Устранить конфликт лимитов текста

Для новой presentation capability задать отдельные versioned bounds: title до 2 000, весь доступный source body до 64 000 UTF-16, полный request до 1 MiB и допустимого model-runtime context budget. 64 000 включает native + article + разделители, а не только статью; extraction cap согласован в §5.1. Начать с batch до 4, уменьшать batch при превышении wire/context budget, не обрезать каждый текст молча. Если один полный item не помещается, typed unavailable. Вход не обязан совпадать с усечённым входом Jev; хранить отдельный presentationInputDigest и связывать оба с одним sourceSnapshotSha256.

V2 лимит 12 000 и его validators сохранить для V2. Для V3 full-input validation должна соответствовать новому cap во всех producer/schema/backend/frontend consumers. Не удалить проверку truncated для удобства: если full captured source превышает cap либо capture заведомо обрезан, сохранять unavailable и причину. Регрессия с опровержением/оговоркой после 12 000 символов обязательна.

Для title-only/partial источника допускается только формулировка, буквально поддержанная доступным текстом с нужной атрибуцией. Недостаток linked article не должен позволить приписать ему выдуманные результаты. Если текущая генерация не умеет безопасный headline такого типа, это видимый presentation reject, не переоценка Jev как noise.

Существующая финальная summary model, story grouping, attribution и citation checks сохраняются. Support-only материалы не обязаны иметь Top-level usefulness или popularity; должны иметь действительную source identity, временную доступность, содержательную same-story связь и проверяемую цитату. Независимость источников не выводить из количества разных сетей.

## 11. API, frontend и версии публикации

Добавить рядом с V2:

- `reader_value.v1` для assessment schema;
- `reader_promotion_policy.v3` для selector;
- `reader_post_promotion.v3`, `reader_post_promotion_attestation.v3`, `reader_post_promotion_digest.sha256.v3` для соответствующих структур, если текущие названия ещё свободны.

В V3 slate/attestation включить immutable безопасные assessment fields, assessmentId/input digest, rubric/model version и tie-break material. Отдельно presentation binding/evidence. Хешировать только явно заданное canonical representation. Не включать токен, сырой model payload или приватный interest text в public attestation.

Проверить consumers: producer candidate projection, backend selection/writer validation, artifact schema/parser, publication gate, REST DTO/OpenAPI, generated TS/Dart clients, Flutter mapper и verifier, promotion board/diagnostic read models. Unknown version fail closed для доверенного представления; старый V1/V2 продолжает читаться как раньше. Новые поля нельзя принимать через удаление strict-key checks.

Версии выше относятся к вложенным promotion structures. Сохранить текущие внешние envelopes `reader_summary.artifact.v1`, publication report/proof и поддержанные publication command variants. В SQL есть exact artifact-version checks и DB canonicalization bounds; promotion V3 сам по себе не требует переименования artifact в v3 или снятия этих проверок. Если реализация всё же требует outer-schema change, это отдельное обоснованное изменение scope с additive SQL support до writer activation. SQL round-trip нового вложенного payload обязателен даже при прежнем outer version. Существующий явно V2-only historical rollback validator не учить V3: обычный mode rollback новых jobs решает другую задачу.

Для текущих backend consumers создать внутренний scoped batch read contract relevance (до 100 IDs за query, большие manifests читать страницами): current assessed snapshot либо явный статус unavailable/stale. Проверять scope каждого ID и interest, исключить N+1 и вызовы модели из read path. Summary читает frozen exact keys, а не current score поверх изменённого source. Будущий UI сможет использовать эти же сохранённые данные.

Публичный assessment endpoint, новые badges/фильтры/контролы сортировки отложить до реального UI consumer. Данные уже включают assessmentId/version, assessedAt, четыре категории и capture/truncation status; будущие бейджи могут показывать `Полезно`, `По теме`, `Текста мало`, но не `точность 93%` из confidence. Public V3 attestation/DTO и совместимость frontend нужны сейчас, поскольку их уже читает существующий экран саммари. Динамическая сортировка будущей ленты не меняет immutable порядок опубликованного саммари.

## 12. Проверка улучшения без затягивания внедрения

Выполнять параллельно с разработкой adapter/storage, не как предварительную многонедельную исследовательскую фазу.

1. Frozen исходные 440 использовать для regression/error examples и дебага. Уже известные примеры не объявлять слепым holdout.
2. Выгрузить 5 новых полных дневных окон по протоколу ниже, не ограничиваться выбранными или популярными. Сохранить time cutoff, точные source snapshots, input/request hashes, config и current code SHA.
3. На одинаковом inventory сравнить frozen V2 и V3 при одинаковых Top limit/dedup/cutoff. Отдельно сравнить reviewer-only и итоговый display-ready Top, иначе headline failures останутся невидимыми.
4. Случайно перемешать union выбранных и стратифицированную выборку исключённых. Независимый разметчик не видит origin, Jev-score, engagement или порядок. Пользователь/человек при возможности подтверждает малый спорный срез; модельные labels честно называются model-judged.
5. Проставить полезно/погранично/шум/недостаточно данных и важное/неважное с кратким основанием. Разметчик видит тот же доступный текст, не домысливает ссылки. Дополнительный full-text comparison оформляется отдельным экспериментом.
6. Посчитать useful unique stories@8 с фиксированным знаменателем, долю шума среди выбранных, пропуски полезных в размеченной части, coverage всех collected кандидатов, дубли, потери presentation. Recall по всему корпусу не заявлять без полной разметки.
7. Минимальный критерий первого включения: V3 даёт больше независимо признанных полезных уникальных материалов при одинаковом Top-8; доля шума не выше V2; не теряет known-important контрольные случаи из-за нового технического пути. Показать абсолютные counts и daily breakdown; малую выборку не выдавать за статистически доказанное универсальное превосходство.
8. Если выигрыш не подтверждён, scorer/storage и V3 contracts могут быть готовы, но default остаётся legacy. Исправить конкретный класс ошибки, а не автоматически добавить новый reviewer/regex layer.

Один контрольный прогон повторить только после изменения rubric/input/selector или обнаруженной ошибки. Цена/скорость измеряются для полного пути: new Jev assessments, cache hits, retrieval, presentation, final summary. Показать cold и warm runs отдельно. Нет оснований обещать полную стоимость $0.056/1 000 или end-to-end latency 387 мс.

Для приёмки зафиксировать ровно 5 новых полных последовательных дневных окон, не использованных для настройки; timezone/границы как в production source-window policy. Если 5 новых окон пока нет, code-ready допускается, quality verdict остаётся insufficient evidence без выдуманного преимущества. Размечается union фактических V2/V3 Top и дополнительно до 100 исключённых candidates, выбранных воспроизводимым seed со стратификацией по provider и дню; выборка не зависит от будущих labels. Borderline/insufficient evidence не считать useful. Считать сумму полезных unique stories по 40 доступным Top slots (пустой слот = 0), noise/selected с опубликованным знаменателем и daily breakdown; при нуле selected noise fraction помечать n/a. Для quality pass нужна строго большая сумма useful, не выросшая измеренная noise fraction и пройденные technical fixtures; если один вариант вообще не выбран/не размечен, superiority verdict не ставить.

Один независимый hosted-разметчик допустим для первого обратимого эксперимента; записать его модель, prompt hash, input hashes и явно обозначить model-judged оценку. Не выдавать этот результат за человеческий ground truth. Известные R2 ошибки используются только как regression fixtures, не входят в новый blind holdout. При смене рубрики после просмотра holdout этот набор становится development set; не объявлять повтор на нём независимым подтверждением.

## 13. Режимы, rollout и откат

Один runtime selector в composition: `legacy_v2 | jev_shadow | jev_primary_v3`, плюс bounded scope и model/rubric config. Domain/features не читают env. Новые selectors покрыть runtime-profile guards.

- `legacy_v2`: прежнее поведение, оценки Jev не влияют на публикацию.
- `jev_shadow`: фоновые оценки и private comparison; public publication остаётся V2. Никакой двойной рассылки.
- `jev_primary_v3`: новый typed path для выбранного scope; опубликованные V2 не переписываются.

Migration additive и deployment совместимый: сначала backend storage/readers и frontend V3 reader, затем фоновая оценка, затем V3 writers только после проверки качества и разрешения выпуска. При откате runtime mode вернуть V2 для новых jobs; уже принятые V3 artifacts продолжают читаться. Не откатывать migration с потерей оценок.

### 13.1. Реальная проверка непосредственно перед publication

`PrismaReaderSummaryPublication` уже имеет `transactionGuard`, но default `summary-reader-summary-publication.provider.ts` его не подключает. В composition обязательно передать V3 guard; legacy behavior сохраняется. Guard определяет стратегию по durable job, а не доверяет только полю caller payload, и работает внутри той же Serializable transaction непосредственно перед `publish_reader_summary`.

Для новой публикации проверить live scope/interest hash/source visibility, manifest binding, RUNNING status, expected execution fence и отсутствие terminalFailureCode. Scope-control rows и job блокируются на время final check + publish, чтобы revocation и publication имели однозначный порядок; не держать locks во время model calls. Отказ guard даёт typed terminal reason, сохраняемый с exact execution fence, без outbox ready event. Не подменять grant/RLS архитектуру broad privileges; добавить только нужные scoped reads. Реальная SQL verification/canonicalization остаётся активной. In-memory adapter должен соблюдать тот же наблюдаемый контракт.

Идемпотентный replay уже committed publication обрабатывается отдельно: SQL сейчас проверяет existing publication до требования RUNNING. Новый guard не должен превращать потерянный ACK успешной публикации в failure. При наличии publication проверить exact scope/job/artifact/report/proof identity и вернуть существующий результат без нового outbox event и без генерации; changed payload не становится replay. Если после commit доступ отозван, не отдавать private artifact вызывающему без обычной read authorization, но не переписывать завершённый job как failed. При неизвестном результате publish сначала перечитать persisted publication/outcome; повторять только тот же idempotent command. Проверить этот путь отдельно от отмены до commit.

### 13.2. Обычный rollback и аварийная отмена

Обычный rollback меняет strategy для новых jobs на legacy_v2 и сохраняет readers/migration для опубликованных V3. Frozen V3 jobs могут закончиться. Для немедленной остановки добавить узкую operator-команду отмены по explicit tenant/workspace и списку job IDs: preview IDs/status, затем атомарно REQUESTED/RUNNING -> FAILED, terminalFailureCode=`operator_cancelled`, под теми же job locks/fences, что использует publication guard. Ни нового публичного endpoint, ни глобального feature-flag сервиса не нужно.

Если cancellation commit первый, поздний model result не публикуется и не перезаписывает terminal outcome. Если publication commit первый, cancellation возвращает already_published и ничего не переписывает; уже созданный outbox event не исчезает. Это не обещание отзыва доставленного материала. Guard проверяется до SQL/outbox side effects, restart/redelivery не сбрасывает operator_cancelled. При возвращении к V2 создать новые jobs штатным запросом; не менять стратегию отменённых.

При Jev outage нет per-post silent fallback в старый алгоритм внутри одного Top. Кэш совпадающей версии используется; незавершённое окно остаётся REQUESTED до preparation deadline, затем получает typed failure по §8.1. При необходимости operator переключает режим для новых jobs целиком; frozen strategy уже начатого job не меняется. Missing labels, missing headlines и настоящий no_signal различать.

Legacy mode останавливает discovery новых фоновых оценок. При обычном rollback assessment loop и due poller продолжают обслуживать exact inputs уже frozen V3 jobs с сохранённой config, пока они не завершатся/не будут отменены; это bounded drain, а не новое shadow-scoring всей ленты. Fatal provider pause остаётся сильнее drain: новых HTTP calls нет, coverage завершается по своему deadline. Cleanup включён независимо от всех трёх режимов. Удаление scope или operator cancellation прекращает соответствующую работу, а не разрешает drain скрытых данных.

Наблюдаемость без отдельного dashboard проекта: counts collected/discovered/assessed/pending/failed/stale, model version, cache-hit ratio, retries/unknown usage, queue age, truncated inputs, semantic admitted, display rejected, duplicates, selected; p50/p95 и cost. Логи без source text/interest/credentials.

## 14. Порядок реализации и ownership

Перед изменениями прочитать root AGENTS/CLAUDE и обязательные linked rules; для Flutter local AGENTS. Внешние инструкции этого плана не заменяют текущие executable gates. Основной агент координирует; hosted implementation `gpt-6-astra low`, review `medium/high`. Локальные workers не запускать. Каждый worker имеет изолированное workspace и непересекающийся ownership.

### Checkpoint 1: scorer + storage + фоновая обработка

Ownership: relevance assessment domain/application/infrastructure, Prisma additive migration/RLS, assessment retention policy/cleanup, intelligence-worker loop/composition, внутренний scoped assessment read contract, deterministic fixtures. Режим по умолчанию legacy. Подготовить conservative input builder и R2-compatible rubric, затем малое уточнение отдельно версионировать. Публичный endpoint для будущего UI не входит.

Готовность: все collected candidates заданного scope discoverable без old floors; новые/revised input оцениваются; all outcomes сохраняются; cache reuse, restart/lease race и scoping доказаны. Public Top не изменён. Уже полезный reviewable checkpoint.

### Checkpoint 2: V3 selector + presentation + совместимые consumers

Ownership: rank-feed-items V3 orchestration, summary preparation manifest/due preflight и его persistence, candidate/slate/attestation/domain validation, presentation capability, wired publication guard/operator cancellation, REST/OpenAPI/generated clients, Flutter V3 verifier/mapper. Это единый compatibility invariant: не резать producer/validator так, чтобы промежуточный writer мог выдавать нечитаемый формат. Reader support можно выпустить раньше writer activation.

Готовность: V3 replay от exact snapshots до signed/readable artifact; scorer не вызывает старые quality gates; unsupported headline не проходит; old artifacts читаются; summary не меняет backend order.

### Checkpoint 3: точечные text capture fixes + сравнение качества

Ownership: подтверждённые ingestion/provider/enrichment потери, source revision/provenance, fixtures. Независимые fixes можно делать параллельно checkpoint 1, но rubric/held-out comparison использовать уже зафиксированный input builder и явно указать версию collection.

Готовность: исправленные источники дают больше доступного текста без потери original body; Jev переоценивает только changed input; полный offline comparison и rollout/rollback evidence подготовлены.

Цель review budget: PR примерно до 2 000 changed human-written LOC; разделять dependency-safe. Для связного большого V3 contract change размер допускается обосновать, не оставлять compatibility сломанной ради числа. Коммиты conventional, owner identity `iliya <iliyazelenkog@gmail.com>`, не выполнять автоматически в задаче планирования.

Зависимости: checkpoint 2 использует контракт checkpoint 1; checkpoint 3 может идти параллельно 1 с согласованным capture schema и source digest. Benchmark/activation только после интеграции всех трёх, чтобы сравнивать окончательный input path. Нельзя включить V3 producer раньше consumers. Каждый checkpoint сдаёт exact SHA/patch, focused check results и соответствующие сценарии A-* ниже; untracked чужие файлы в commit не включать.

## 15. Тесты и проверки

Focused tests, не тесты-тени реализации:

- Адаптер: valid response, unknown/missing category, sum/NaN, wrong model, 429/Retry-After, deadline, aborted request, uncertain billed timeout, redaction.
- БД: tenant/interest isolation, exact hash changes от punctuation/negation/availability и изменения за пределом Jev excerpt; повторный identical fetch/engagement не создаёт новую оценку; ranking-only cache hit, source update/new interest/config, duplicate concurrent claim, stale lease response, successful result immutability, retry exhaustion, resume после crash, source deletion/retention.
- Summary preparation: freeze-once concurrent start, неизменный manifest при source/config update и restart, ACK deferred + due poller resume, terminal deadline без paid generation и повторного оживления, missing/permanent failure не превращается в no_signal, readiness не истекает посреди generation, queue-only primary config rejected, inventory overflow не становится partial Top.
- Input: source body вместо preview, combined article provenance, Unicode boundary, длинный interest, input budget, no popularity leak, source prompt injection.
- Selector: низкопопулярный полезный обходит популярный шум; missing/null/zero metrics; transitivity/determinism/tie-break; RSS; GitHub appendix; provider cap; best story representative unavailable -> next valid; короткий честный Top.
- Presentation: exact quote/offset binding; late disclaimer/retraction после 12k; статья 30k-64k с native segment проходит ingestion/presentation без старой 30k обрезки; truly truncated/суммарно больше 64k не проходит как complete; request budget уменьшает batch; failed model -> no raw-title fallback; не использовать old quality flags повторно.
- Published contract: V1/V2 regression unchanged, V3 producer-to-persistence-to-REST-to-Flutter conformance; altered assessment/rubric/order invalidates digest; source snapshot immutable для старого artifact.
- Ingestion: provider-native full-text preference, article fetch failure preserves body, retry after budget/noise gate change, no downgrade enriched->preview, redirect/private target/body cap, total deadline.

Проверенные имена существующих gates (запускать по changed surface в тестовом окружении):

```text
npm run check:architecture
npm run check:code-quality
npm run check:source-line-cap
npm run check:runtime-profile-guards
npm run check:migrations
npm run check:tenant-db-guards
npm run check:relevance-persistence
npm run check:ingestion-feed-persistence
npm run check:summary-persistence
npm run check:retention
npm run check:retention-plan
npm run check:openapi
npm run check:mobile-client-contract
npm run check:flutter-client-contract
npm run check:source-certification
```

Добавить focused integration gate для assessments, не маскировать его отсутствием ошибок старого relevance-persistence. Для Flutter: `fvm flutter analyze`, architecture boundaries test и затронутые tests; generated client/shared-kernel gates по AGENTS. Генерируемые файлы не править вручную. На source/provider изменениях проверить подходящий fixture/source smoke только в разрешённом тестовом окружении. Full verify не запускать, если содержит запрещённые real-project agent flows. Тяжёлые сборки/тесты выполнять на сервере.

### 15.1. Обязательные acceptance scenarios

Каждая строка требует проверяемого результата, а не только наличия функции/мока. Unit fixtures достаточны для comparator; DB races/RLS/retention доказываются integration tests в sandbox; publication contract проходит реальную сериализацию backend -> generated client -> Flutter verifier. Live Jev smoke небольшой и отдельный, offline fixtures покрывают ошибки без платных повторов.

| ID | Вход/событие | Ожидаемый исход |
| --- | --- | --- |
| A01 | Низкопопулярный useful+central и популярный noise+central | Первый admitted, второй нет; старые floors/regex не вызываются в V3 |
| A02 | useful+relevant, context=insufficient, evidence=linked_claim | Semantic admitted; presentation проверяет только доступную опору, без выдумывания статьи |
| A03 | usefulness=insufficient_context либо relevance=adjacent | Валидный assessed, обычная лента, не Top, без fetch/research от summary |
| A04 | choice=useful, argmax=context; отдельный probability tie | В обоих случаях решение по choice; diagnostic mismatch, без silent пересчёта |
| A05 | Identical повтор, новые лайки; затем правка отрицания/хвоста за Jev excerpt | Первые два cache hit; правка даёт новую identity и новую оценку |
| A06 | Один source в двух interests и дубликаты FeedItem в одном interest | Две scoped semantic оценки; дубликаты внутри interest не вызывают новую API работу |
| A07 | Два claims одной row; crash после HTTP; поздний первый ответ | Один актуальный lease, reserved attempt израсходована; поздний ответ не пишет; максимум 3 dispatch reservations |
| A08 | DB commit ответа прошёл, ACK потерялся | Reread exact key возвращает assessed; повторного HTTP нет; unknown cost не превращается в 0 |
| A09 | 429 с Retry-After; 401; schema mismatch | Backoff не раньше header; auth pause; schema failure целиком, без частичных labels/noise |
| A10 | HN внешняя статья, затем второй scan только с native | Статья загружена по externalUrl и не затёрта; canonical остаётся HN |
| A11 | RSS 304 после budget skip; URL сменился во время fetch | Due attempt при 304; старый URL completion отклоняется CAS, новая ссылка не получает старый текст |
| A12 | Article 40k с оговоркой после 30k, плюс небольшой native | Full capture/presentation, оговорка доходит до writer evidence; caps/quotes согласованы |
| A13 | Source/model input реально усечён | Model truncation явно сохранено; capture/presentation truncation не выдаётся за complete |
| A14 | Frozen summary, restart, новые posts/body/config | Тот же manifest, cutoff, стратегия и exact keys; новые inputs только следующему job |
| A15 | Оценки приняты deadline-1 ms; poller пришёл позже; UPDATE ждал lock через deadline | Ready только для действительно принятого вовремя update. Transaction-start time не маскирует принятие deadline+1 ms; timeout без generation |
| A16 | Workspace/source отозван перед публикацией | scope_changed, нет публикации/восстановления данных; удаление сильнее retention pin |
| A17 | Первый представитель story без headline; следующий годен; разные batch delays | Один представитель, одинаковый итоговый порядок при обоих расписаниях; provider cap применяется один раз |
| A18 | 1/2/3 provider, cap overflow, <8 useful, >32 presentation candidates | Caps 8/6/4; Additional из оставшихся; короткий Top разрешён; непроверенные явно budget_exhausted |
| A19 | Нет semantic-admitted; отдельно есть admitted, но все headlines unavailable | Первый no_signal, второй presentation_unavailable; dependency failure не публикует subset |
| A20 | Legacy artifact, V3 artifact, подмена category/order/digest, неизвестная версия | V1/V2 прежние; V3 читается; подмена/unknown version отвергается доверенным представлением |
| A21 | Конфигурация primary + выключенный poller; inventory > ceiling | Ошибка composition; отдельный over-budget failure, не вечное ожидание/усечённый Top |
| A22 | Старый source изменён между sweep pages, новый interest/config, restart | Обнаружение на следующем полном sweep; очередь в БД цела, successful inputs не вызываются повторно |
| A23 | Secret/instruction после 280 символов; redaction меняет длину | API/custody не получают вырезанный secret; quotes проверяются по sanitized input; старые quality flags не становятся safety gate |
| A24 | Deadline failure/crash и два competing preflight handlers | Один атомарный REQUESTED -> FAILED либо ready claim; нет промежуточного RUNNING при fail, double claim или возврата в REQUESTED |
| A25 | Expired cache, manifest freeze/purge race, поздний preflight, source tombstone, legal hold, scoring off | Нет dangling manifest; stale job pin не снимается по одному wall clock, tombstone закрывает доступ, hold блокирует TTL purge, cleanup тикает независимо от scorer |
| A26 | Cancel и SQL publish конкурентны, commit в обоих порядках | Cancel-first: нет publication/outbox; publish-first: already_published; поздняя запись worker не оживляет job |
| A27 | Вложенный V3 + прежний outer envelope через реальный publish_reader_summary; ACK commit потерян | Верификация, canonical bounds и чтение проходят; exact replay completed job без новой генерации/outbox, changed payload отвергнут; outer checks/V2-only historical rollback сохранены |
| A28 | Rollback primary -> legacy при REQUESTED/RUNNING V3; затем fatal pause/отмена | Новые jobs V2; frozen V3 обслуживаются с закреплённой config, без discovery нового Jev scope. Fatal pause запрещает HTTP, отмена не оживляется, cleanup продолжает работать |

### 15.2. Ограничители сложности

Одна новая assessment-таблица с bounded attempt JSON, additive preparation-поля existing job, один DB-backed scoring loop, один OpenRouter adapter, один V3 policy path. Existing pipeline/worker/provider infrastructure переиспользовать. Не добавлять новый публичный API ради тестирования, generic event sourcing, cache service, version graph, LLM reranker, автоматический prompt optimizer или configurable rule DSL. Защиты от scope leakage, старых ответов, утраты текста и подделанных quotes обязательны и не считаются необязательным «усложнением».

Если существующая схема требует маленького scoped constraint/index или нормального разбиения слишком большого файла, это внутри scope. Если выбранный контракт требует ещё одного сервиса, многоступенчатого workflow либо обхода executable architecture gate, остановить именно это расширение и вернуться к минимальному варианту в плане; не подменять рабочее решение простым, но некорректным bypass.

## 16. Оценка объёма и критерии завершения

Предварительная оценка, не обещание точного diff:

| Часть | Source/config/migration | Tests |
| --- | ---: | ---: |
| Scorer, inputs, storage, batch loop, internal batch read, scoped cleanup | 900-1 500 | 500-800 |
| V3 preparation/selection/presentation/guard/contracts/frontend compatibility | 1 000-1 600 | 650-1 000 |
| Подтверждённые ingestion fixes, включая HTTP и enrichment lifecycle | 400-800 | 450-800 |
| Итого | 2 300-3 900 | 1 600-2 600 |

Общий ориентир 3 900-6 500 строк без generated/lockfiles. Уточнение относительно редакции 2 включает конкретную очистку cache и publication guard вместо предположения, что они уже готовы. Сам вызов Jev намного меньше; основная работа - сохранение и корректное встраивание в существующие контракты. Не строить слои ради достижения оценки и не срезать provenance/compatibility ради нижней границы.

Завершение реализации:

- [ ] Каждый уникальный collected post активного scoped interest обнаруживается; нет скрытого старого prefilter перед Jev.
- [ ] Все четыре критерия и versions доступны после restart; смена comparator не вызывает Jev.
- [ ] Очистка assessments реально исполняется, учитывает active pins/hold/scope deletion и не запускает повторную оплату expired inputs.
- [ ] Summary ждёт exact frozen assessments по bounded preflight и продолжает после restart; deadline/failure не запускают неполный Top.
- [ ] Дополнительный доступный текст получается при ingestion и не теряется при сохранении/повторном scan.
- [ ] V3 честно поддерживает RSS/missing popularity и сохраняет GitHub appendix boundary.
- [ ] Jev semantic decisions не проходят заново через V2 score/floors.
- [ ] Headline/evidence capability отдельно проверена и не потеряла qualifiers/binding.
- [ ] V3 читается frontend, V1/V2 остаются совместимыми; старые публикации immutable.
- [ ] Transaction guard подключён; отмена и lost-ACK replay доказаны реальными SQL tests без дублирования outbox.
- [ ] Независимое сравнение показывает улучшение на заявленной выборке либо default остаётся legacy с честным отчётом.
- [ ] Rollout/rollback конфигурация, полный cost/latency и известные ограничения описаны.
- [ ] Выпуск выполнен только после отдельного разрешения; до него code-ready не называется production-enabled.

## Приложение A. Результат аудита ingestion

Hosted read-only job `sm-jev-ingestion-plan-audit-20260920`, `gpt-6-astra medium`, exact SHA выше, завершён без изменений. Основной агент проверил цепочку перезаписи enriched body, HN externalUrl и RSS HTTP/parser непосредственно в коде. Полный worker report: `docs/reports/2026-09-20-jev-ingestion-context-audit.md`.

| Приоритет | Подтверждённое поведение | Обязательное действие |
| --- | --- | --- |
| Высокий | Неизменный fetched native body снова передаётся в persistence; hash включает merged body, поэтому ранее добавленная статья может быть перезаписана | Разделить native/effective hashes и preservation policy, регрессия двух последовательных scans |
| Высокий | HN article URL лежит в externalUrl, extractor проверяет discussion URL | Исправить URL selection без изменения canonical identity HN |
| Высокий | failed/budget-skipped становятся processed; observation_due/engagement_changed не попадают в enrichment | Независимый due retry с bounded attempts; RSS 304 не пропускает его |
| Высокий | DNS/private targets не защищены на transport; RSS redirects/body недостаточно ограничены | Targeted article/RSS HTTP protection до расширения ingestion |
| Средний | Article 30k truncation не отражается; model 12k имеет другую границу | Capture provenance и отдельный versioned presentation input |
| Средний | Atom вложенный XHTML не читается scalar/#text parser | Fixture-backed parse fix |

| Provider | Что уже есть | MVP |
| --- | --- | --- |
| HN | Полный story.text, обычно пустой для link story, externalUrl; comments отдельно | Корректный external article fetch при сборе |
| Reddit | selftext целиком + linkedUrl + отдельные comments | Сохранить existing native text; исправить общий enrichment lifecycle |
| RSS | content:encoded/content предпочтительнее summary; HTML article extractor | XHTML fix, skip redundant fetch только при обоснованной полноте, due retry при 304 |
| X | Scweet text проходит без обрезки body; short title отдельно | Long-text regression и честная availability; note tweets зависят от SDK, отсутствие их поддержки не доказано |
| GitHub radar | Repository description, README не загружается | description_only, без нового README pipeline |
| GitHub trending | Описание карточки, immutable scan snapshot | description_only, appendix unchanged; старые snapshots не менять |

Дополнительно учесть final summary evidence reduction: `openai-responses-reader-summary-adaptive-evidence.ts` использует baseline 600 символов, expanded до 25 candidates, полный текст до 2 500 либо до 3 excerpts по 780. Это отдельный context budget, не потеря source_items.body. Для V3 выбранных лидеров включить проверенные headline support/qualification spans в writer input, чтобы поздняя оговорка не исчезла снова при summary compression; не передавать полный корпус всем генеративным стадиям.

Production runtime configuration/данные не проверялись, сетевое воспроизведение не выполнялось. Оценки severity и LOC предварительные. На старом hosted server запуск был недоступен из-за runtime guard; на новом root-pool o/t вернули invalid sessions. Штатный fallback к настроенному `/var/data/codex-home/live-codex-auth` завершил исследование. Никакие credentials не переносились; локальный сабагент не запускался.

## Приложение B. Проверенные внешние источники и доступ

- TypeSafe state: <https://docs.typesafe.ai/concepts/state>.
- Atomic questions/code-owned flow: <https://docs.typesafe.ai/concepts/how-to-build-with-system-one>.
- Models/limits: <https://docs.typesafe.ai/models>. На 2026-09-20 документация указывает text-only, 64k total tokens и 32k state+longest question; ограничения TypeSafe не считать гарантированными OpenRouter quotas. Нативные IDs TypeSafe отличаются от OpenRouter.
- OpenRouter runner и response validation уже есть в `scripts/evals/reader-value-primary-scorer/run-jev.swift`; credential retrieval оттуда не переносить в production container.
- Приватные R2 inputs: `/tmp/social-monitor-jev-primary-scorer-r2/`; временный каталог может исчезнуть. Safe manifest/report в repo не заменяют корпус; подготовить разрешённый private frozen export перед benchmark, не публиковать raw texts в Git.
- Для fresh read-only corpus следовать `docs/plans/2026-09-20-jev-real-post-spike-handoff.md`: SSH `codex-workers-eu-01`, контейнер `social-monitor-prod-intelligence-worker-1`, scoped READ ONLY SQL, TLS CA, короткие timeouts. Не выводить DSN/env/key и не держать транзакцию во время model calls.

## Приложение C. Независимая проверка плана

Hosted read-only job `sm-jev-plan-review-20260920`, `gpt-6-astra medium`, проверил первоначальный документ и исходный код на указанном HEAD. Все четыре замечания включены основным агентом в эту редакцию:

- P1: полный source digest теперь обязателен в assessment identity, даже если Jev видит сокращённый текст (§6.1/7.1).
- P1: вместо ссылки на несуществующее pending state описан REQUESTED preflight с immutable manifest, due polling, ready fence и terminal deadline (§8.1).
- P2: extraction/presentation caps согласованы; regression 30k-64k проверяет реальный путь текста (§5.1/10.4/15).
- P2: публичный assessment endpoint отложен до UI consumer; внутреннее batch read и существующий V3 frontend contract сохранены (§11/14).

После первой правки выполнена локальная проверка документа и сверка lifecycle с кодом. Проверка реализации и production verification не выполнялись: реализация ещё не начата.

Для редакции 2 выполнен дополнительный hosted read-only аудит `sm-jev-scope-edge-review-20260920`, `gpt-6-astra medium`, в отдельном test checkout того же SHA. Он проверял документ до текущих уточнений, параллельно работе основного агента. Шесть findings включены в контракт: reservation попыток и unknown billing (§7.2); live scope revocation (§8.1); точные article URL/reuse/capture timestamps (§5.4); provider cap и детерминированный presentation budget (§9.2/10.3); deadline/readiness race (§8.1); authoritative choice против probabilities (§6.3). Для каждого есть сценарий A-*.

Основной агент дополнительно сверил READ ONLY snapshot boundary, реальные ceilings 100k/1k, provider caps 10/6/4 до ограничения Top-8 и существующую safety redaction. В итоговой редакции устранены неоднозначности без новой очереди, сервисов, public UI API и универсального retry framework. Изменения текста после этого аудита проверены локально; отдельного утверждения, что окончательный текст повторно независимо одобрен, нет.

Для редакции 3 выполнен hosted read-only аудит `sm-jev-publish-retention-review-20260920`, `gpt-6-astra medium`, в отдельном test checkout того же SHA. Три подтверждённых замечания включены в scope:

- Существующий transactionGuard не подключён в default publication provider: обязательны wiring, live checks и отмена exact job с проверкой порядка commit (§13.1/13.2).
- Retention contract и PlanRetentionPurgeUseCase только описывают/рассчитывают политику: добавлена исполняемая bounded очистка новой cache-таблицы, реальные pin/hold/tombstone правила (§7.3).
- SQL проверяет внешний `reader_summary.artifact.v1`: nested promotion V3 не меняет этот envelope; обязателен SQL round-trip без снятия version guards (§11).

Основной агент дополнительно проверил `ReaderSummaryJob.fail`, `saveExecutionOutcome`, fallback transaction helper и SQL replay-before-RUNNING. Уточнены atomic failPreparation, отсутствие повторного claim, DB wall clock на границе deadline, safe replay потерянного publication ACK и drain frozen jobs при rollback. Финальные 7 scope blocks и 28 acceptance scenarios проверены локально; окончательная редакция после внесения замечаний не проходила ещё один независимый review. Это review плана, не доказательство готовности реализации.
