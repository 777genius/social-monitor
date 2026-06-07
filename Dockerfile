FROM node:22-bookworm-slim AS app

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY apps ./apps
COPY libs ./libs

RUN npm run prisma:generate && npm run build

ARG SERVICE=api
ENV SERVICE=${SERVICE}
USER node

CMD ["sh", "-c", "npm run start:${SERVICE}"]
