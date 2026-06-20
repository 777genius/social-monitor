FROM node:22-bookworm-slim AS app

WORKDIR /app

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY apps ./apps
COPY libs ./libs

ARG PRISMA_GENERATE_DATABASE_URL=postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor
RUN DATABASE_URL="${PRISMA_GENERATE_DATABASE_URL}" npm run prisma:generate && npm run build

ARG SERVICE=api
ENV NODE_ENV=production
ENV SERVICE=${SERVICE}
USER node

CMD ["sh", "-c", "npm run start:${SERVICE}"]
