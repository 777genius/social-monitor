# The build toolchain runs in CI; end users pull the resulting static image.
ARG FLUTTER_IMAGE=ghcr.io/cirruslabs/flutter:3.41.9@sha256:c6fed8fee02ca8fdb1b8dc128df99f6e29b7305847b80f4b0c1e3f638e7637a8
ARG NGINX_IMAGE=nginx:stable-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5
FROM --platform=$BUILDPLATFORM ${FLUTTER_IMAGE} AS web-build
ENV CI=true
WORKDIR /workspace/apps/frontend
COPY apps/frontend/ ./
COPY --chmod=0644 AGENTS.md /workspace/AGENTS.md
COPY --chmod=0644 scripts/create-frontend-feature.mjs /workspace/scripts/create-frontend-feature.mjs
COPY ops/quickstart/frontend-defines.json /workspace/frontend-defines.json
RUN flutter pub get
# Same executable surface as npm run check:frontend; SDK version is pinned above.
RUN flutter analyze \
    && flutter test app/test \
    && flutter test packages/design_system \
    && dart test packages/shared_kernel \
    && dart test packages/generated_api
WORKDIR /workspace/apps/frontend/app
RUN flutter build web --release --no-tree-shake-icons \
    --dart-define-from-file=/workspace/frontend-defines.json

FROM ${NGINX_IMAGE}
LABEL org.opencontainers.image.source="https://github.com/777genius/social-monitor"
COPY --from=web-build /workspace/apps/frontend/app/build/web /usr/share/nginx/html
COPY ops/quickstart/nginx.conf.template /etc/nginx/templates/default.conf.template
RUN chmod -R u=rwX,go=rX /usr/share/nginx/html /etc/nginx/templates
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=12 \
  CMD wget -q -O /dev/null http://127.0.0.1/ready || exit 1
