# syntax=docker/dockerfile:1

# Production image for the DNH API.
#
#   docker build -t dnh-api .
#   docker run --init --env-file .env.production -p 4815:4815 dnh-api
#
# Builder and runtime stages share the same Debian (glibc) base so the native
# bcrypt binary installed while building loads in the runtime image.

# Node 22 LTS; pin a full version (e.g. 22.21.1) for fully reproducible builds.
ARG NODE_VERSION=22

# --- base: Node + pnpm (version pinned by package.json "packageManager") ---
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# The corepack bundled with older Node 22 releases has stale npm signing
# keys; a pinned recent corepack verifies pnpm's signature reliably.
RUN npm install -g corepack@0.36.0 && corepack enable
WORKDIR /app

# --- toolchain: compilers in case a native module has no prebuilt binary ---
FROM base AS toolchain
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# "prepare" runs husky (a dev-only git hook installer) on install; it has no
# place in an image and fails when dev dependencies are skipped.
RUN npm pkg delete scripts.prepare && corepack install

# --- build: all dependencies, compile TypeScript to dist/ ---
FROM toolchain AS build
RUN pnpm install --frozen-lockfile
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
# nest build also copies the email templates (src/**/*.pug) into dist/.
RUN pnpm build

# --- prod-deps: runtime dependencies only ---
FROM toolchain AS prod-deps
RUN pnpm install --frozen-lockfile --prod

# --- runtime ---
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
	TZ=Africa/Accra \
	PORT=4815
WORKDIR /app

# Files stay owned by root and read-only to the app; it writes nothing to disk.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 4815

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4815) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/main"]
