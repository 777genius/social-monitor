# [Social Monitor](https://social-monitor.app/)

<a href="https://discord.gg/MWmrv57Qkt"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Fv10%2Finvites%2FqtqSZSyuEc%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&label=Discord&logo=discord&logoColor=white&color=5865F2&style=flat-square&suffix=%20members" alt="Discord" /></a>
<a href="https://social-monitor.app/"><img src="https://img.shields.io/badge/Site-social--monitor.app-22C55E?style=flat-square&logo=googlechrome&logoColor=white" alt="Social Monitor Site" /></a>


¿Cansado de navegar por cientos de publicaciones casi idénticas en todas las redes sociales solo para encontrar las pocas que realmente importan?

Construí Social Monitor porque estaba harto del ruido. En lugar de ahogarme en opiniones duplicadas, reposteos y relleno de X, Reddit, sitios de noticias y demás, quería una herramienta que rescatara las publicaciones genuinamente interesantes y me dijera qué sucedió realmente.

## Qué hace

Social Monitor recopila publicaciones y señales de redes sociales, noticias y la web, y luego lo agrega todo en un solo lugar. Conectas y combinas múltiples fuentes y, en lugar de leer miles de publicaciones, obtienes un resumen claro y conciso de todo el conjunto: sin relleno, solo lo que importa.

Clasifica todo y construye un feed de publicaciones principales, por lo que el contenido más importante y relevante sube automáticamente al principio. Y todo está impulsado por tus intereses: tú le indicas qué te importa y la herramienta ajusta lo que ves en función de ello.

<img width="2178" height="1157" alt="image" src="https://github.com/user-attachments/assets/926b1651-0a48-496e-9d29-201d22edc7a6" />

## Resúmenes según tu horario

¿No quieres revisarlo constantemente? Recibe un resumen en su lugar:

- Diario: lo que pasó hoy, en una sola lectura.
- Semanal: la visión general de la semana.
- Mensual: las tendencias y aspectos destacados que realmente importaron.

Deja de consumir ruido. Mira lo que es importante.

<img width="1777" height="1157" alt="image" src="https://github.com/user-attachments/assets/39247c45-867c-4935-b4cc-114a17739627" />

## Qué hay en este repositorio

- API de backend y workers para monitoreo, ingesta, feed, resúmenes, entrega, identidad, uso, relevancia y observabilidad.
- Runtime local durable con PostgreSQL, RabbitMQ, Redis, migraciones de Prisma, relay de eventos y servicios de Docker Compose con perfil de aplicación.
- Workspace de frontend en Flutter con un app shell, sistema de diseño responsivo, contratos de runtime compartidos, frontera de API generada y paquetes de características DDD.
- Contratos generados de REST/móvil/frontend y verificaciones de OpenAPI.
- Memoria de arquitectura, playbooks de frontend, puertas de calidad y pruebas de frontera ejecutables.

Social Monitor no es un SaaS alojado en este repositorio. Es una implementación MVP/referencia full-stack que puedes ejecutar localmente, extender y adaptar.

## Qué puedes construir con ello

- Monitoreo de marcas, productos, creadores, repositorios o temas.
- Dashboards de inteligencia de noticias y medios.
- Pipelines de ingesta de señales sociales y web públicas.
- Flujos de monitoreo de reputación, riesgo e incidentes.
- Superficies de revisión para analistas sobre elementos del feed, salud de la fuente, resúmenes y resúmenes de lectura.
- Experimentos de conectores de fuentes para APIs, feeds, webhooks, colas y verificaciones de proveedores en vivo.
- Pipelines de triaje asistido por IA, resumización, clustering, retroalimentación de relevancia y evaluación.
- Herramientas internas para analistas, operadores, soporte y equipos de ingeniería.

## Estado del Proyecto

Esta es una implementación MVP con una estructura sustancial de backend y frontend ya implementada.

Ideal hoy para:

- Explorar la arquitectura full-stack y la dirección del producto.
- Ejecutar la API de backend, workers, migraciones e infraestructura local.
- Ejecutar el app shell de Flutter en modo demo.
- Conectar fragmentos de características del frontend al runtime de API generado donde los contratos de backend estén disponibles.
- Extender los contextos delimitados de API, ingesta, feed, resúmenes, entrega, identidad, relevancia, observabilidad y frontend.

Aún no es ideal para:

- Despliegue en producción plug-and-play sin revisión.
- Monitoreo sensible o regulado sin tus propios controles legales, de privacidad, seguridad, retención y políticas de plataforma.
- Asumir que cada documento de arquitectura está totalmente implementado en el código de producción.
- Tratar las rutas de datos del frontend de demostración como integraciones listas para producción.

## Stack Tecnológico

Backend:

- TypeScript en Node.js 22+
- NestJS para módulos de aplicación, APIs REST e infraestructura orientada a WebSockets
- Prisma para esquema de base de datos, migraciones y adaptadores de persistencia
- PostgreSQL, RabbitMQ, Redis y Kafka opcional para infraestructura local
- Jest y Supertest para pruebas unitarias y de extremo a extremo (e2e)
- ESLint y verificaciones de arquitectura personalizadas
- Arquitectura Limpia (Clean Architecture) y contextos delimitados estilo DDD

Frontend:

- Flutter 3.41.9 a través de FVM
- Workspaces de Dart bajo `apps/frontend`
- App shell orientado a web con restricciones responsivas para móviles
- GoRouter para el enrutamiento de la aplicación
- `modularity_flutter` para los límites de los módulos de características
- Paquete `design_system` del producto que envuelve primitivas de UI headless
- `shared_kernel` para estado asíncrono tipado, fallos, contratos de ruta, alcance del workspace, paginación, política de caché, intención de acción, ordenamiento en tiempo real y primitivas de observabilidad
- Paquete `generated_api` para transporte REST generado y mapeo de Problem Details
- Paquetes de características para autenticación, temas, fuentes, feed, resúmenes y configuración

## Mapa del Repositorio

```text
apps/
  api-gateway/          punto de entrada de la API REST
  delivery-service/     flujos de entrega y notificación
  event-relay/          relay de outbox-to-broker para eventos de dominio duraderos
  ingestion-worker/     punto de entrada del procesamiento de ingesta
  intelligence-worker/  punto de entrada del procesamiento de análisis e inteligencia
  frontend/
    app/                app shell de Flutter, enrutamiento y raíz de composición
    packages/
      design_system/    envoltorios de UI del producto, tokens y primitivas responsivas
      shared_kernel/    primitivas de runtime de frontend y estado tipado
      generated_api/    frontera del cliente REST generado
    features/
      auth/             flujos de sesión, inquilino y acceso al workspace
      topics/           intenciones de monitoreo, consultas y cobertura de temas
      sources/          catálogo de fuentes, enlaces, credenciales y estado de escaneo
      feed/             elementos agregados de proveedores, filtros y flujos de revisión
      summaries/        resúmenes de lectura, extractos y flujos de revisión de insights
      settings/         gobernanza del workspace, diagnósticos y preferencias

libs/
  contracts/            contratos REST/OpenAPI y contratos de cliente generados
  delivery/             dominio de entrega y adaptadores
  feed/                 modelos de lectura de feed deduplicados y flujos de revisión
  identity/             inquilinos, workspaces, claves API y flujos relacionados con auth
  ingestion/            proveedores de fuentes, ejecución de escaneo, cursores y proyección de feed
  monitoring/           solicitudes de escaneo y flujos de monitoreo
  relevance/            flujos de retroalimentación, preferencia y aprendizaje de relevancia
  summary/              trabajos de resumen, artefactos, resúmenes de lectura, feedback y adaptadores de modelo
  usage/                controles de auditoría, cuotas y límites de tasa (rate-limit)
  platform/             utilidades de plataforma compartidas y puertos de infraestructura

docs/
  architecture-memory/  decisiones duraderas de producto y arquitectura
  providers/            configuración por proveedor para recolección real de fuentes
  iterations/           notas de implementación y planificación

prisma/
  schema.prisma         esquema de base de datos
  seed.ts               script de seed local

test/
  e2e/                  pruebas de API de extremo a extremo
```

## Inicio Rápido

Prerrequisitos:

- Node.js 22 o superior
- npm
- Docker y Docker Compose
- FVM con Flutter 3.41.9 para el trabajo de frontend

Clonar el repositorio:

```sh
git clone https://github.com/777genius/social-monitor.git
cd social-monitor
```

Instalar dependencias del backend:

```sh
npm install
```

Crear configuración de entorno local:

```sh
cp .env.example .env
```

Iniciar solo la infraestructura local:

```sh
docker compose up -d
```

Validar migraciones de base de datos y generar cliente de Prisma:

```sh
npm run check:migrations
```

Iniciar la API localmente en modo determinista en memoria:

```sh
npm run start:api
```

Iniciar la API localmente en modo durable conectado, que es el modo correcto para la pantalla `/summaries` de Flutter y la revisión de resúmenes de lectura:

```sh
# Usa otro puerto de host primero si el 5432 local ya está ocupado:
# export POSTGRES_PORT=55432
docker compose up -d postgres rabbitmq

POSTGRES_PORT="$(docker compose port postgres 5432 | awk -F: '{print $NF}')"
LOCAL_DATABASE_URL="postgresql://social_monitor:social_monitor_local_password@127.0.0.1:${POSTGRES_PORT:-5432}/social_monitor"

DATABASE_URL="$LOCAL_DATABASE_URL" npm run migrate:deploy
DATABASE_URL="$LOCAL_DATABASE_URL" npm run seed

DATABASE_URL="$LOCAL_DATABASE_URL" \
SUMMARY_PERSISTENCE=prisma \
FEED_PERSISTENCE=prisma \
RELEVANCE_PERSISTENCE=prisma \
SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev \
TRUSTED_WORKSPACE_ROLE_HEADER=enabled \
SOCIAL_MONITOR_CORS_ORIGINS="http://127.0.0.1:53217,http://localhost:53217" \
npm run start:api
```

Usa `docker compose port postgres 5432` en lugar de asumir `5432`; las máquinas locales pueden remapear la base de datos de compose a otro puerto del host, por ejemplo `55432`. Si ya hay otro Postgres escuchando en `127.0.0.1:5432`, exporta `POSTGRES_PORT=55432` antes de `docker compose up`; de lo contrario, Prisma podría conectarse al Postgres del host en lugar de la base de datos de compose.

Importante: no ejecutes `/summaries` conectado solo con `SUMMARY_PERSISTENCE=prisma`. Los resúmenes de lectura se cargan desde la persistencia de resúmenes, pero las estadísticas de cobertura, los conteos de publicaciones recopiladas y los detalles de las más leídas usan el modelo de lectura del feed. Si `FEED_PERSISTENCE` permanece como `in-memory`, la interfaz de usuario puede mostrar citas pero seguir indicando `0 Posts`.

Otros puntos de entrada del backend:

```sh
npm run start:ingestion
npm run start:intelligence
npm run start:delivery
npm run start:event-relay
```

Iniciar el perfil de aplicación MVP durable con API, workers, relay de eventos, PostgreSQL y RabbitMQ:

```sh
docker compose --profile app up -d --build
```

El perfil de aplicación ejecuta un servicio de `migrate` de un solo disparo antes de iniciar la API y los workers. Los selectores de runtime en `docker-compose.yml` utilizan la persistencia de Prisma, colas de comandos de RabbitMQ y el proveedor de entrega de webhooks HTTP firmado donde esté disponible.

## Primer Resultado de Fuente Extremo a Extremo

La ruta más rápida: usa un proveedor que no necesite credenciales. Comienza con Hacker News, RSS o la página de tendencias de GitHub.

1. Iniciar el perfil de aplicación:

   ```sh
   cp .env.example .env
   docker compose --profile app up -d --build
   ```

2. Crear un interés:

   ```sh
   export API_BASE_URL=http://127.0.0.1:3000
   export TENANT_ID=00000000-0000-7000-8000-000000000901
   export WORKSPACE_ID=00000000-0000-7000-8000-000000000902

   curl -sS -X POST "$API_BASE_URL/interests" \
     -H "content-type: application/json" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-interest-openai" \
     -d '{"name":"OpenAI monitoring","query":"OpenAI developer tools"}'
   ```

3. Vincular una fuente. Usa el `interestId` devuelto:

   ```sh
   curl -sS -X POST "$API_BASE_URL/interests/<interestId>/source-bindings" \
     -H "content-type: application/json" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-bind-hn-openai" \
     -d '{"providerKey":"hacker-news","config":{"mode":"search","query":"OpenAI","maxItems":10}}'
   ```

4. Solicitar un escaneo. Usa el `sourceBindingId` devuelto:

   ```sh
   curl -sS -X POST "$API_BASE_URL/source-bindings/<sourceBindingId>/scan-requests" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-scan-hn-openai"
   ```

5. Verificar estado y elementos del feed. Usa el `scanJobId` devuelto:

   ```sh
   curl -sS "$API_BASE_URL/scan-requests/<scanJobId>/status" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner"

   curl -sS "$API_BASE_URL/feed/items?limit=20" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner"
   ```

Abre la documentación de configuración de proveedores antes de habilitar fuentes que requieran credenciales:

- `docs/providers/README.md` - matriz de proveedores y configuración de fuente extremo a extremo.
- `docs/providers/hacker-news.md` - no requiere cuenta ni clave.
- `docs/providers/rss.md` - no requiere clave, pero cada vínculo necesita una URL de feed pública.
- `docs/providers/github-trending-page.md` - no requiere cuenta ni clave.
- `docs/providers/github-repo-radar.md` - requiere Google Cloud BigQuery para el modo live completo.
- `docs/providers/github-issues.md` - solo manual, token de GitHub opcional, requiere flag de beta en runtime de beta.
- `docs/providers/reddit.md` - requiere credenciales de OAuth de Reddit para datos reales.
- `docs/providers/x-twitter.md` - configuración de colector privado, solo para cuentas de investigación dedicadas.
- `docs/providers/telegram.md` - diferido, aún no hay un proveedor de runtime vinculable.

## Inicio Rápido del Frontend

Instalar o refrescar las dependencias del workspace de Flutter:

```sh
cd apps/frontend
fvm flutter pub get
```

Ejecutar el frontend en modo demo:

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 -t lib/main_demo.dart
```

Ejecutar el frontend contra un runtime de API local:

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 \
  --dart-define=SOCIAL_MONITOR_API_BASE_URL=http://127.0.0.1:3000 \
  --dart-define=SOCIAL_MONITOR_TENANT_ID=00000000-0000-7000-8000-000000000901 \
  --dart-define=SOCIAL_MONITOR_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 \
  --dart-define=SOCIAL_MONITOR_USER_ID=local-frontend-user \
  --dart-define=SOCIAL_MONITOR_WORKSPACE_ROLE=owner \
  --dart-define=SOCIAL_MONITOR_INITIAL_ROUTE=/summaries
```

Sustituye los IDs de demo por los IDs del workspace contra el que estés ejecutando.

La ruta de frontend `/summaries` lee la API de resúmenes de lectura. No es la lista legacy de artefactos de resumen, por lo que una respuesta vacía de `/summaries` legacy no significa que la pantalla de resumen de lectura no tenga datos. Para datos locales conectados, la API y el frontend deben usar los mismos IDs de inquilino/workspace.

Definiciones opcionales para modo conectado:

```sh
--dart-define=SOCIAL_MONITOR_TENANT_NAME="Current tenant"
--dart-define=SOCIAL_MONITOR_WORKSPACE_NAME="Current workspace"
--dart-define=SOCIAL_MONITOR_WORKSPACE_ROLE=admin
--dart-define=SOCIAL_MONITOR_USER_LABEL="MVP Operator"
--dart-define=SOCIAL_MONITOR_CORRELATION_ID=frontend-generated-api-session
--dart-define=SOCIAL_MONITOR_API_BEARER_TOKEN=<your-token>
```

El origen CORS predeterminado en `.env.example` es `http://localhost:53217`, así que mantén `--web-port=53217` a menos que actualices la configuración de CORS del backend.

## Comandos Útiles

Verificaciones del backend y del repositorio:

```sh
npm run build
npm run lint
npm run test
npm run test:e2e
npm run check:architecture
npm run check:code-quality
npm run check:runtime-compose
npm run check:runtime-profile-guards
npm run check:local-infra
npm run verify
```

Verificaciones del frontend:

```sh
npm run check:frontend
cd apps/frontend && fvm flutter analyze
cd apps/frontend && fvm flutter test app
cd apps/frontend && fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart
cd apps/frontend && fvm flutter test packages/design_system
cd apps/frontend && fvm dart test packages/shared_kernel packages/generated_api
```

Generación y andamiaje del frontend:

```sh
npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"
npm run frontend:generate-api
```

Las verificaciones de conectores en vivo están separadas intencionalmente de `npm run verify` porque pueden llamar a servicios externos y pueden requerir cuentas reales. Consulta `docs/providers/README.md` para ver la matriz de proveedores actual, la configuración de credenciales y los comandos de evidencia en vivo por proveedor.

La captura de feedback de resúmenes espera una entrada JSON ya redactada fuera del workspace de git. Configura `SUMMARY_FEEDBACK_REDACTED_INPUT_PATH`, `SUMMARY_REAL_FEEDBACK_SAMPLES_PATH`, `SUMMARY_FEEDBACK_SOURCE_KIND`, `SUMMARY_FEEDBACK_ENVIRONMENT_ID`, `SUMMARY_FEEDBACK_OPERATOR`, `SUMMARY_FEEDBACK_REDACTED_BY`, `SUMMARY_FEEDBACK_APPROVED_BY`, `SUMMARY_FEEDBACK_COLLECTION_METHOD`, y ya sea el input `sampleWindow` o `SUMMARY_FEEDBACK_WINDOW_STARTED_AT` / `SUMMARY_FEEDBACK_WINDOW_ENDED_AT`.

## Documentación de Arquitectura

Comienza aquí para la arquitectura del backend y del sistema completo:

- `docs/architecture-memory/00-index.md`
- `docs/architecture-memory/100-architecture-summary.md`
- `docs/architecture-memory/101-bounded-context-map.md`
- `docs/architecture-memory/102-service-interface-contracts.md`
- `docs/architecture-memory/103-event-catalog-v1.md`

Comienza aquí para la arquitectura del frontend:

- `apps/frontend/AGENTS.md`
- `apps/frontend/docs/README.md`
- `apps/frontend/docs/frontend-implementation-plan.md`
- `apps/frontend/docs/frontend-ux-architecture.md`
- `apps/frontend/docs/frontend-state-playbook.md`
- `apps/frontend/docs/frontend-api-contract-playbook.md`
- `apps/frontend/docs/frontend-testing-strategy.md`

La memoria de arquitectura y los playbooks de frontend son detallados intencionalmente. Capturan decisiones sobre ingesta, monitoreo, identidad, entrega, observabilidad, enrutamiento de frontend, límites del sistema de diseño, estado, mapeo de API, gobernanza de datos, evaluación de IA y preparación para producción.

## Uso Responsable

Utiliza este proyecto únicamente con fuentes de datos que tengas permiso para acceder y monitorear. El monitoreo social y web puede afectar la privacidad, la seguridad y el cumplimiento de las políticas de la plataforma. Antes de usarlo en producción, revisa los términos de las fuentes, la retención de datos, el consentimiento del usuario, la base legal, la minimización de datos, el manejo de credenciales y los controles de acceso interno.

## Licencia

MIT. Ver [LICENSE](LICENSE).
