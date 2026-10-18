# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migrations and the create-admin script run from /tools with full dependencies
COPY --from=deps /app/node_modules /tools/node_modules
COPY package.json /tools/
COPY drizzle /tools/drizzle
COPY scripts /tools/scripts
COPY src/db/schema.ts /tools/src/db/schema.ts
COPY src/lib/format.ts /tools/src/lib/format.ts
USER app
EXPOSE 3000
CMD ["node", "server.js"]
