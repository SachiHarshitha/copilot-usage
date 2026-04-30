# Multi-stage build for the Next.js web app.
# Built from the repo root: `docker build -f deploy/web.Dockerfile .`
FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared-schema/package.json packages/shared-schema/
RUN pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app /app
COPY . .
WORKDIR /app/apps/web
RUN pnpm prisma generate && pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Run as non-root.
RUN useradd --system --create-home --shell /usr/sbin/nologin app
COPY --from=build --chown=app:app /app /app
USER app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
